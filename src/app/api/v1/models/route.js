import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getProviderAlias, isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";
import { getProviderConnections, getCombos, getModelAliases, getCustomModels } from "@/lib/localDb";

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

// Matches provider IDs that are upstream/cross-instance connections (contain a UUID suffix)
const UPSTREAM_CONNECTION_RE = /[-_][0-9a-f]{8,}$/i;

async function fetchCompatibleModelIds(connection) {
  if (!connection?.apiKey) return [];

  const baseUrl = typeof connection?.providerSpecificData?.baseUrl === "string"
    ? connection.providerSpecificData.baseUrl.trim().replace(/\/$/, "")
    : "";

  if (!baseUrl) return [];

  let url = `${baseUrl}/models`;
  const headers = {
    "Content-Type": "application/json",
  };

  if (isOpenAICompatibleProvider(connection.provider)) {
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else if (isAnthropicCompatibleProvider(connection.provider)) {
    if (url.endsWith("/messages/models")) {
      url = url.slice(0, -9);
    } else if (url.endsWith("/messages")) {
      url = `${url.slice(0, -9)}/models`;
    }
    headers["x-api-key"] = connection.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    const rawModels = parseOpenAIStyleModels(data);

    return Array.from(
      new Set(
        rawModels
          .map((model) => model?.id || model?.name || model?.model)
          .filter((modelId) => typeof modelId === "string" && modelId.trim() !== "")
      )
    );
  } catch {
    return [];
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models - OpenAI compatible models list
 * Returns models from all active providers and combos in OpenAI format
 */
export async function GET() {
  try {
    // Get active provider connections
    let connections = [];
    try {
      connections = await getProviderConnections();
      // Filter to only active connections
      connections = connections.filter(c => c.isActive !== false);
    } catch (e) {
      // If database not available, return all models
      console.log("Could not fetch providers, returning all models");
    }

    // Get combos
    let combos = [];
    try {
      combos = await getCombos();
    } catch (e) {
      console.log("Could not fetch combos");
    }

    // Get model aliases (includes custom models added via "+ Add Model" button)
    let modelAliases = {};
    try {
      modelAliases = await getModelAliases();
    } catch (e) {
      console.log("Could not fetch model aliases");
    }

    // Get custom models added via "+ Add Model" button
    let customModels = [];
    try {
      customModels = await getCustomModels();
    } catch (e) {
      console.log("Could not fetch custom models");
    }

    // Build first active connection per provider (connections already sorted by priority)
    const activeConnectionByProvider = new Map();
    for (const conn of connections) {
      if (!activeConnectionByProvider.has(conn.provider)) {
        activeConnectionByProvider.set(conn.provider, conn);
      }
    }

    // Collect models from active providers (or all if none active)
    const models = [];
    const timestamp = Math.floor(Date.now() / 1000);

    // Add combos first (they appear at the top)
    for (const combo of combos) {
      models.push({
        id: combo.name,
        object: "model",
        created: timestamp,
        owned_by: "combo",
        permission: [],
        root: combo.name,
        parent: null,
      });
    }

    // Add provider models
    if (connections.length === 0) {
      // DB unavailable or no active providers -> return all static models
      for (const [alias, providerModels] of Object.entries(PROVIDER_MODELS)) {
        for (const model of providerModels) {
          models.push({
            id: `${alias}/${model.id}`,
            object: "model",
            created: timestamp,
            owned_by: alias,
            permission: [],
            root: model.id,
            parent: null,
          });
        }
      }

      // Also include custom models and modelAliases even when no connections
      const addedIds = new Set(models.map((m) => m.id));
      for (const cm of customModels) {
        const fullId = `${cm.providerAlias}/${cm.id}`;
        if (!addedIds.has(fullId)) {
          models.push({
            id: fullId,
            object: "model",
            created: timestamp,
            owned_by: cm.providerAlias,
            permission: [],
            root: cm.id,
            parent: null,
          });
          addedIds.add(fullId);
        }
      }
      for (const [, fullModel] of Object.entries(modelAliases)) {
        if (!addedIds.has(fullModel) && fullModel.includes("/")) {
          const prefix = fullModel.split("/")[0];
          models.push({
            id: fullModel,
            object: "model",
            created: timestamp,
            owned_by: prefix,
            permission: [],
            root: fullModel.split("/").slice(1).join("/"),
            parent: null,
          });
          addedIds.add(fullModel);
        }
      }
    } else {
      for (const [providerId, conn] of activeConnectionByProvider.entries()) {
        const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
        const outputAlias = (
          conn?.providerSpecificData?.prefix
          || getProviderAlias(providerId)
          || staticAlias
        ).trim();
        const providerModels = PROVIDER_MODELS[staticAlias] || PROVIDER_MODELS[providerId] || [];
        const enabledModels = conn?.providerSpecificData?.enabledModels;
        const hasExplicitEnabledModels =
          Array.isArray(enabledModels) && enabledModels.length > 0;
        const isCompatibleProvider =
          isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

        // Default: if no explicit selection, all static models are active.
        // For compatible providers with no explicit selection, fetch remote /models dynamically.
        // If explicit selection exists, expose exactly those model IDs (including non-static IDs).
        let rawModelIds = hasExplicitEnabledModels
          ? Array.from(
              new Set(
                enabledModels.filter(
                  (modelId) => typeof modelId === "string" && modelId.trim() !== "",
                ),
              ),
            )
          : providerModels.map((model) => model.id);

        // Merge in custom models added via "+ Add Model" button.
        // These are stored as model aliases where alias === modelId and fullModel === `${staticAlias}/${modelId}`.
        {
          const currentIds = new Set(rawModelIds);

          if (!hasExplicitEnabledModels) {
            // Merge from modelAliases (legacy path) — only when no explicit selection
            const aliasPrefix = `${staticAlias}/`;
            const aliasModelIds = Object.entries(modelAliases)
              .filter(([aliasName, fullModel]) =>
                fullModel.startsWith(aliasPrefix) &&
                aliasName === fullModel.slice(aliasPrefix.length)
              )
              .map(([, fullModel]) => fullModel.slice(aliasPrefix.length))
              .filter((modelId) => !currentIds.has(modelId));
            if (aliasModelIds.length > 0) {
              rawModelIds = [...rawModelIds, ...aliasModelIds];
              aliasModelIds.forEach((id) => currentIds.add(id));
            }
          } else {
            // Even with explicit enabledModels, still merge user-added custom models from aliases
            // UI stores them as: { "v4-pro": "deepseek/v4-pro" } or { "v4-pro": "ds/v4-pro" }
            const aliasPrefixes = [`${staticAlias}/`, `${outputAlias}/`, `${providerId}/`];
            const aliasModelIds = Object.entries(modelAliases)
              .filter(([aliasName, fullModel]) =>
                aliasPrefixes.some((prefix) =>
                  fullModel.startsWith(prefix) &&
                  aliasName === fullModel.slice(prefix.length)
                )
              )
              .map(([, fullModel]) => {
                for (const prefix of aliasPrefixes) {
                  if (fullModel.startsWith(prefix)) return fullModel.slice(prefix.length);
                }
                return fullModel;
              })
              .filter((modelId) => !currentIds.has(modelId));
            if (aliasModelIds.length > 0) {
              rawModelIds = [...rawModelIds, ...aliasModelIds];
              aliasModelIds.forEach((id) => currentIds.add(id));
            }
          }

          // Always merge from customModels array (stored via /api/models/custom)
          const customModelIds = customModels
            .filter((m) => m.providerAlias === outputAlias || m.providerAlias === staticAlias)
            .map((m) => m.id)
            .filter((modelId) => !currentIds.has(modelId));
          if (customModelIds.length > 0) {
            rawModelIds = [...rawModelIds, ...customModelIds];
          }
        }

        if (isCompatibleProvider && rawModelIds.length === 0 && !UPSTREAM_CONNECTION_RE.test(providerId)) {
          rawModelIds = await fetchCompatibleModelIds(conn);
        }

        const modelIds = rawModelIds
          .map((modelId) => {
            if (modelId.startsWith(`${outputAlias}/`)) {
              return modelId.slice(outputAlias.length + 1);
            }
            if (modelId.startsWith(`${staticAlias}/`)) {
              return modelId.slice(staticAlias.length + 1);
            }
            if (modelId.startsWith(`${providerId}/`)) {
              return modelId.slice(providerId.length + 1);
            }
            return modelId;
          })
          .filter((modelId) => typeof modelId === "string" && modelId.trim() !== "");

        for (const modelId of modelIds) {
          models.push({
            id: `${outputAlias}/${modelId}`,
            object: "model",
            created: timestamp,
            owned_by: outputAlias,
            permission: [],
            root: modelId,
            parent: null,
          });
        }
      }

      // Also include custom models for providers that have NO active connection
      // (e.g. user added a custom model to DeepSeek but hasn't added an API key yet)
      const connectedAliases = new Set(
        [...activeConnectionByProvider.entries()].flatMap(([providerId, conn]) => {
          const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
          const outputAlias = (
            conn?.providerSpecificData?.prefix
            || getProviderAlias(providerId)
            || staticAlias
          ).trim();
          return [staticAlias, outputAlias, providerId];
        })
      );

      for (const cm of customModels) {
        if (!connectedAliases.has(cm.providerAlias)) {
          models.push({
            id: `${cm.providerAlias}/${cm.id}`,
            object: "model",
            created: timestamp,
            owned_by: cm.providerAlias,
            permission: [],
            root: cm.id,
            parent: null,
          });
        }
      }

      // Also include modelAliases for providers not in any active connection
      // e.g. { "v4-pro": "deepseek/v4-pro" } when deepseek has no connection
      const addedModelIds = new Set(models.map((m) => m.id));
      for (const [aliasName, fullModel] of Object.entries(modelAliases)) {
        if (!addedModelIds.has(fullModel) && !addedModelIds.has(aliasName)) {
          // Check if this fullModel belongs to a connected provider
          const prefix = fullModel.includes("/") ? fullModel.split("/")[0] : null;
          if (prefix && !connectedAliases.has(prefix)) {
            models.push({
              id: fullModel,
              object: "model",
              created: timestamp,
              owned_by: prefix,
              permission: [],
              root: fullModel.split("/").slice(1).join("/"),
              parent: null,
            });
            addedModelIds.add(fullModel);
          }
        }
      }
    }

    return Response.json({
      object: "list",
      data: models,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
