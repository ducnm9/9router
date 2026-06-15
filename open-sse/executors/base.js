import { HTTP_STATUS, RETRY_CONFIG, DEFAULT_RETRY_CONFIG, UPSTREAM_CONFIG, resolveRetryEntry } from "../config/runtimeConfig.js";
import { resolveOllamaLocalHost } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

// Bun-specific socket errors that indicate connection was dropped (not a server error)
const SOCKET_ERROR_PATTERNS = [
  "socket connection was closed unexpectedly",
  "connection was forcibly closed",
  "ECONNRESET",
  "ETIMEDOUT",
  "socket hang up",
  "network socket disconnected",
];

/**
 * BaseExecutor - Base class for provider executors
 */
export class BaseExecutor {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
    this.noAuth = config?.noAuth || false;
  }

  getProvider() {
    return this.provider;
  }

  getBaseUrls() {
    return this.config.baseUrls || (this.config.baseUrl ? [this.config.baseUrl] : []);
  }

  getFallbackCount() {
    return this.getBaseUrls().length || 1;
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    if (this.provider?.startsWith?.("openai-compatible-")) {
      const baseUrl = credentials?.providerSpecificData?.baseUrl || "https://api.openai.com/v1";
      const normalized = baseUrl.replace(/\/$/, "");
      const path = this.provider.includes("responses") ? "/responses" : "/chat/completions";
      return `${normalized}${path}`;
    }
    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      const baseUrl = credentials?.providerSpecificData?.baseUrl || "https://api.anthropic.com/v1";
      const normalized = baseUrl.replace(/\/$/, "");
      return `${normalized}/messages`;
    }
    if (this.provider === "ollama-local") {
      return `${resolveOllamaLocalHost(credentials)}/api/chat`;
    }
    const baseUrls = this.getBaseUrls();
    return baseUrls[urlIndex] || baseUrls[0] || this.config.baseUrl;
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      ...this.config.headers
    };

    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      // Anthropic-compatible providers use x-api-key header
      if (credentials.apiKey) {
        headers["x-api-key"] = credentials.apiKey;
      } else if (credentials.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.accessToken}`;
      }
      if (!headers["anthropic-version"]) {
        headers["anthropic-version"] = "2023-06-01";
      }
    } else {
      // Standard Bearer token auth for other providers
      if (credentials.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.accessToken}`;
      } else if (credentials.apiKey) {
        headers["Authorization"] = `Bearer ${credentials.apiKey}`;
      }
    }

    if (stream) {
      headers["Accept"] = "text/event-stream";
    }

    return headers;
  }

  // Override in subclass for provider-specific transformations
  transformRequest(model, body, stream, credentials) {
    return body;
  }

  shouldRetry(status, urlIndex) {
    return status === HTTP_STATUS.RATE_LIMITED && urlIndex + 1 < this.getFallbackCount();
  }

  // Override in subclass for provider-specific refresh
  async refreshCredentials(credentials, log, proxyOptions = null) {
    return null;
  }

  needsRefresh(credentials) {
    if (!credentials.expiresAt) return false;
    const expiresAtMs = new Date(credentials.expiresAt).getTime();
    return expiresAtMs - Date.now() < 5 * 60 * 1000;
  }

  parseError(response, bodyText) {
    return { status: response.status, message: bodyText || `HTTP ${response.status}` };
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const fallbackCount = this.getFallbackCount();
    let lastError = null;
    let lastStatus = 0;
    const retryAttemptsByUrl = {};

    // Merge default retry config with provider-specific config
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...this.config.retry };

    // Schedule retry via retryConfig[statusKey]. Returns true when caller should `urlIndex--; continue`
    const tryRetry = async (urlIndex, statusKey, reason) => {
      const { attempts, delayMs } = resolveRetryEntry(retryConfig[statusKey]);
      if (attempts <= 0 || retryAttemptsByUrl[urlIndex] >= attempts) return false;
      retryAttemptsByUrl[urlIndex]++;
      log?.debug?.("RETRY", `${reason} retry ${retryAttemptsByUrl[urlIndex]}/${attempts} after ${delayMs / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return true;
    };

    for (let urlIndex = 0; urlIndex < fallbackCount; urlIndex++) {
      const url = this.buildUrl(model, stream, urlIndex, credentials);
      const transformedBody = this.transformRequest(model, body, stream, credentials);
      const headers = this.buildHeaders(credentials, stream);

      if (!retryAttemptsByUrl[urlIndex]) retryAttemptsByUrl[urlIndex] = 0;

      try {
        // Combine client abort signal with upstream timeout to prevent Bun from
        // closing the socket when waiting for long-thinking models (e.g. Claude thinking, o1)
        const timeoutMs = UPSTREAM_CONFIG.socketTimeoutMs;
        const upstreamSignal = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs);

        const response = await proxyAwareFetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(transformedBody),
          signal: upstreamSignal
        }, proxyOptions);

        if (await tryRetry(urlIndex, response.status, `status ${response.status}`)) { urlIndex--; continue; }

        if (this.shouldRetry(response.status, urlIndex)) {
          log?.debug?.("RETRY", `${response.status} on ${url}, trying fallback ${urlIndex + 1}`);
          lastStatus = response.status;
          continue;
        }

        return { response, url, headers, transformedBody };
      } catch (error) {
        lastError = error;
        if (error.name === "AbortError") {
          // Distinguish client abort (external signal) from our timeout abort
          // If the external signal was aborted, the client disconnected — propagate immediately
          if (signal?.aborted) throw error;
          // Otherwise it's our socketTimeoutMs timeout — treat as retryable socket error
          const { attempts, delayMs } = UPSTREAM_CONFIG.socketRetry;
          const timeoutRetries = retryAttemptsByUrl[`timeout_${urlIndex}`] || 0;
          if (timeoutRetries < attempts) {
            retryAttemptsByUrl[`timeout_${urlIndex}`] = timeoutRetries + 1;
            log?.debug?.("RETRY", `Upstream timeout (${UPSTREAM_CONFIG.socketTimeoutMs / 1000}s) retry ${timeoutRetries + 1}/${attempts} after ${delayMs / 1000}s`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            urlIndex--;
            continue;
          }
          throw error;
        }

        // Check if this is a socket-level error (Bun: "socket connection was closed unexpectedly")
        const isSocketError = SOCKET_ERROR_PATTERNS.some(p => error.message?.toLowerCase().includes(p.toLowerCase()));

        if (isSocketError) {
          const { attempts, delayMs } = UPSTREAM_CONFIG.socketRetry;
          const socketRetries = retryAttemptsByUrl[`socket_${urlIndex}`] || 0;
          if (socketRetries < attempts) {
            retryAttemptsByUrl[`socket_${urlIndex}`] = socketRetries + 1;
            log?.debug?.("RETRY", `Socket error "${error.message}" retry ${socketRetries + 1}/${attempts} after ${delayMs / 1000}s`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            urlIndex--;
            continue;
          }
        }

        // Map network/fetch exceptions to 502 retry config
        if (await tryRetry(urlIndex, HTTP_STATUS.BAD_GATEWAY, `network "${error.message}"`)) { urlIndex--; continue; }

        if (urlIndex + 1 < fallbackCount) {
          log?.debug?.("RETRY", `Error on ${url}, trying fallback ${urlIndex + 1}`);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error(`All ${fallbackCount} URLs failed with status ${lastStatus}`);
  }
}

export default BaseExecutor;
