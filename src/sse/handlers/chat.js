import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { cacheClaudeHeaders } from "open-sse/utils/claudeHeaderCache.js";
import { getSettings, getApiKeyByValue } from "@/lib/localDb";
import { isKeyExpired } from "@/lib/db/repos/apiKeysRepo.js";
import { apiKeyLimiter, ipLimiter } from "@/lib/rateLimiter.js";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { getCounter, checkQuota } from "@/lib/quotaDb";
import { getNotifier } from "@/lib/notifier.js";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat } from "open-sse/services/combo.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { logAuditEvent } from "@/lib/db/repos/auditRepo.js";
import { getHealthTracker } from "@/lib/providerHealth.js";
import { getRequestCache } from "@/lib/requestCache.js";

/**
 * Apply routing strategy to combo models.
 * Returns a reordered copy — never mutates input.
 */
function applyRoutingStrategy(comboModels, settings, tracker) {
  if (!comboModels || comboModels.length < 2) return comboModels;
  const strategy = settings?.routingStrategy;
  if (!strategy || strategy === 'priority') return comboModels;

  const scored = comboModels.map((m, idx) => {
    const provider = m.split('/')[0];
    const health = tracker.getHealth(provider);
    return { m, idx, health };
  });

  if (strategy === 'latency') {
    return scored.sort((a, b) => {
      if (a.health.status === 'unhealthy' && b.health.status !== 'unhealthy') return 1;
      if (b.health.status === 'unhealthy' && a.health.status !== 'unhealthy') return -1;
      const scoreA = (a.health.successRate ?? 0.5) * (1000 / Math.max(a.health.avgLatencyMs ?? 500, 1));
      const scoreB = (b.health.successRate ?? 0.5) * (1000 / Math.max(b.health.avgLatencyMs ?? 500, 1));
      return scoreB - scoreA;
    }).map(x => x.m);
  }

  if (strategy === 'balanced') {
    // Normalize health score to [0,1] using relative rank among providers with data
    const withData = scored.filter(x => x.health.successRate !== null);
    const maxScore = withData.length > 0
      ? Math.max(...withData.map(x => (x.health.successRate ?? 0) * (1000 / Math.max(x.health.avgLatencyMs ?? 500, 1))))
      : 1;

    return scored.sort((a, b) => {
      if (a.health.status === 'unhealthy' && b.health.status !== 'unhealthy') return 1;
      if (b.health.status === 'unhealthy' && a.health.status !== 'unhealthy') return -1;

      const priorityA = 1 / (a.idx + 1);
      const priorityB = 1 / (b.idx + 1);
      // Normalize priority to [0,1] based on max (1/1 = 1.0)
      const maxPriority = 1;
      const normPriorityA = priorityA / maxPriority;
      const normPriorityB = priorityB / maxPriority;

      const rawHealthA = (a.health.successRate ?? 0) * (1000 / Math.max(a.health.avgLatencyMs ?? 500, 1));
      const rawHealthB = (b.health.successRate ?? 0) * (1000 / Math.max(b.health.avgLatencyMs ?? 500, 1));
      const normHealthA = maxScore > 0 ? rawHealthA / maxScore : 0;
      const normHealthB = maxScore > 0 ? rawHealthB / maxScore : 0;

      const blendA = 0.6 * normPriorityA + 0.4 * normHealthA;
      const blendB = 0.6 * normPriorityB + 0.4 * normHealthB;
      return blendB - blendA;
    }).map(x => x.m);
  }

  return comboModels;
}

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  cacheClaudeHeaders(clientRawRequest.headers);

  // Log request endpoint and model
  const url = new URL(request.url);
  const modelStr = body.model;

  // Count messages (support both messages[] and input[] formats)
  const msgCount = body.messages?.length || body.input?.length || 0;
  const toolCount = body.tools?.length || 0;
  const effort = body.reasoning_effort || body.reasoning?.effort || null;
  log.request("POST", `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`);

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
    // Check key expiration
    const keyRecord = await getApiKeyByValue(apiKey);
    if (keyRecord && isKeyExpired(keyRecord)) {
      log.warn("AUTH", "Expired API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "API key has expired");
    }
  }

  // --- Rate Limiting ---
  if (settings.rateLimitEnabled) {
    const clientIp = getClientIp(request);

    // Per-IP check
    const ipResult = ipLimiter.check(clientIp);
    if (!ipResult.allowed) {
      return new Response(JSON.stringify({
        error: { message: `Rate limit exceeded. Retry after ${Math.ceil(ipResult.retryAfterMs / 1000)}s`, type: 'rate_limit_error' }
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(ipResult.retryAfterMs / 1000)),
          'X-RateLimit-Limit': String(settings.rateLimitPerIp ?? 120),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + ipResult.retryAfterMs) / 1000))
        }
      });
    }

    // Per-key check (if key identified)
    if (apiKey) {
      const keyResult = apiKeyLimiter.check(apiKey);
      if (!keyResult.allowed) {
        return new Response(JSON.stringify({
          error: { message: `API key rate limit exceeded. Retry after ${Math.ceil(keyResult.retryAfterMs / 1000)}s`, type: 'rate_limit_error' }
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(keyResult.retryAfterMs / 1000)),
            'X-RateLimit-Limit': String(settings.rateLimitPerKey ?? 60),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil((Date.now() + keyResult.retryAfterMs) / 1000))
          }
        });
      }
    }
  }

  // --- Quota Check ---
  if (apiKey) {
    try {
      const keyConfig = await getApiKeyByValue(apiKey);
      if (keyConfig?.quota) {
        const counter = await getCounter(keyConfig.id);
        const quotaResult = checkQuota(counter, keyConfig.quota);

        if (!quotaResult.allowed) {
          const tokensDisplay = quotaResult.limit.maxTokens
            ? `${quotaResult.usage.totalTokens.toLocaleString()}/${quotaResult.limit.maxTokens.toLocaleString()}`
            : "N/A";
          log.warn("QUOTA", `Key ${log.maskKey(apiKey)} exceeded quota: ${tokensDisplay}`);

          // Fire budget alert notification (non-blocking)
          getNotifier().send({
            event: 'quota_exceeded',
            keyId: keyConfig?.id,
            keyName: keyConfig?.name,
            usage: quotaResult.usage.totalTokens,
            limit: quotaResult.limit.maxTokens,
            unit: 'tokens'
          }).catch(() => {}); // Never block request on notification failure

          return new Response(
            JSON.stringify({
              error: {
                type: "quota_exceeded",
                message: `API key quota exceeded. Token usage: ${tokensDisplay}. Resets on ${new Date(quotaResult.resetsAt).toISOString().slice(0, 10)}.`,
                code: "quota_exceeded",
                quota: {
                  tokens: {
                    used: quotaResult.usage.totalTokens,
                    limit: quotaResult.limit.maxTokens,
                  },
                  cost: {
                    used: quotaResult.usage.totalCost,
                    limit: quotaResult.limit.maxCost,
                  },
                  resetsAt: quotaResult.resetsAt,
                },
              },
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        // Store quota warning info for response headers
        if (quotaResult.warning) {
          request.__quotaWarning = {
            tokensUsed: quotaResult.usage.totalTokens,
            tokensLimit: quotaResult.limit.maxTokens,
            costUsed: quotaResult.usage.totalCost,
            costLimit: quotaResult.limit.maxCost,
            resetsAt: quotaResult.resetsAt,
          };

          // Fire budget warning notification (non-blocking)
          getNotifier().send({
            event: 'quota_warning',
            keyId: keyConfig?.id,
            keyName: keyConfig?.name,
            usage: quotaResult.usage.totalTokens,
            limit: quotaResult.limit.maxTokens,
            unit: 'tokens'
          }).catch(() => {}); // Never block request on notification failure
        }
      }
    } catch (err) {
      log.debug("QUOTA", `Quota check skipped: ${err.message}`);
    }
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // --- Response Cache Check ---
  let _cacheKey = null;
  if (settings.cacheEnabled && !body.stream) {
    const cache = getRequestCache();
    _cacheKey = cache.buildKey(body);
    if (_cacheKey) {
      const cached = cache.get(_cacheKey);
      if (cached) {
        log.debug("CACHE", `HIT ${_cacheKey}`);
        return new Response(JSON.stringify({ ...cached, _cached: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            'X-Cache-Key': _cacheKey
          }
        });
      }
    }
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
    
    const comboStickyLimit = settings.comboStickyRoundRobinLimit;

    // Apply routing strategy to combo model order
    let orderedModels = comboModels;
    if (comboModels.length > 1) {
      const tracker = getHealthTracker();

      // Skip unhealthy providers if enabled (only when alternatives exist)
      if (settings.skipUnhealthyProviders) {
        const healthy = orderedModels.filter(m => {
          return tracker.getHealth(m.split('/')[0]).status !== 'unhealthy';
        });
        if (healthy.length > 0) orderedModels = healthy;
      }

      orderedModels = applyRoutingStrategy(orderedModels, settings, tracker);
    }

    log.info("CHAT", `Combo "${modelStr}" with ${orderedModels.length} models (strategy: ${comboStrategy}, routing: ${settings.routingStrategy || 'priority'}, sticky: ${comboStickyLimit})`);
    const comboResponse = await handleComboChat({
      body,
      models: orderedModels,
      handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit
    });
    if (_cacheKey && comboResponse?.status === 200) {
      try {
        const data = await comboResponse.clone().json();
        if (!data.error) { getRequestCache().set(_cacheKey, data); log.debug("CACHE", `SET ${_cacheKey}`); }
      } catch { /* non-JSON, skip */ }
    }
    return comboResponse;
  }

  // Single model request
  const singleResponse = await handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey);
  if (_cacheKey && singleResponse?.status === 200) {
    try {
      const data = await singleResponse.clone().json();
      if (!data.error) { getRequestCache().set(_cacheKey, data); log.debug("CACHE", `SET ${_cacheKey}`); }
    } catch { /* non-JSON or streaming, skip */ }
  }
  return singleResponse;
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null) {
  const modelInfo = await getModelInfo(modelStr);

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      
      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;

      // Apply routing strategy to combo model order
      let orderedModels = comboModels;
      if (comboModels.length > 1) {
        const tracker = getHealthTracker();

        if (chatSettings.skipUnhealthyProviders) {
          const healthy = orderedModels.filter(m => {
            return tracker.getHealth(m.split('/')[0]).status !== 'unhealthy';
          });
          if (healthy.length > 0) orderedModels = healthy;
        }

        orderedModels = applyRoutingStrategy(orderedModels, chatSettings, tracker);
      }

      log.info("CHAT", `Combo "${modelStr}" with ${orderedModels.length} models (strategy: ${comboStrategy}, routing: ${chatSettings.routingStrategy || 'priority'}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: orderedModels,
        handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Log model routing (alias → actual model)
  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn("CHAT", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    // Log account selection
    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const _healthStart = Date.now();
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      providerThinking,
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
      }
    });

    if (result.success) {
      // Record provider health success
      getHealthTracker().recordSuccess(provider, {
        latencyMs: Date.now() - _healthStart,
        model,
        connectionId: credentials.connectionId
      });
      // Non-blocking audit log (fire-and-forget)
      logAuditEvent({
        action: 'chat.request',
        resource: 'model',
        resourceId: `${provider}/${model}`,
        details: {
          provider,
          tokensUsed: result.usage?.total_tokens || result.usage?.totalTokens,
          stream: !!body?.stream
        },
        ip: request ? getClientIp(request) : undefined
      }).catch(() => {});
      return result.response;
    }

    // Record provider health failure
    getHealthTracker().recordFailure(provider, {
      statusCode: result.status,
      error: result.error,
      model,
      connectionId: credentials.connectionId
    });

    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)
    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs);

    // Notify: provider account is down
    getNotifier().send({
      event: 'provider_down',
      provider: `${provider}/${model}`,
      error: result.error || 'request failed',
      failures: 1
    }).catch(() => {});

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);

      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;

      // Only notify if there is actually a next provider to fall back to
      const nextCredential = await getProviderCredentials(provider, excludeConnectionIds, model);
      if (nextCredential && !nextCredential.allRateLimited) {
        getNotifier().send({
          event: 'fallback_triggered',
          from: `${provider}/${model}`,
          reason: result.error || 'provider_unavailable'
        }).catch(() => {});
      }

      continue;
    }

    return result.response;
  }
}
