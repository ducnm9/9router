import { NextResponse } from "next/server";
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  getProviderAlias,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  AI_PROVIDERS,
  FREE_PROVIDERS,
} from "@/shared/constants/providers";
import { getProviderConnections, getCombos, getModelAliases, getCustomModels } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// Matches provider IDs that are upstream/cross-instance connections (contain a UUID suffix)
const UPSTREAM_CONNECTION_RE = /[-_][0-9a-f]{8,}$/i;

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

/**
 * Fetch models from a compatible provider's remote /models endpoint.
 */
async function fetchCompatibleModelIds(connection) {
  if (!connection?.apiKey) return [];

  const baseUrl = typeof connection?.providerSpecificData?.baseUrl === "string"
    ? connection.providerSpecificData.baseUrl.trim().replace(/\/$/, "")
    : "";

  if (!baseUrl) return [];

  let url = `${baseUrl}/models`;
  const headers = { "Content-Type": "application/json" };

  if (isOpenAICompatibleProvider(connection.provider)) {
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else if (isAnthropicCompatibleProvider(connection.provider)) {
    if (url.endsWith("/messages/models")) url = url.slice(0, -9);
    else if (url.endsWith("/messages")) url = `${url.slice(0, -9)}/models`;
    headers["x-api-key"] = connection.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: "GET", headers, cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return [];
    const data = await response.json();
    const rawModels = parseOpenAIStyleModels(data);
    return Array.from(
      new Set(rawModels.map((m) => m?.id || m?.name || m?.model).filter((id) => typeof id === "string" && id.trim() !== ""))
    );
  } catch {
    return [];
  }
}

// Filters for modelsFetcher types (same as /api/providers/suggested-models)
const MODELS_FETCHER_FILTERS = {
  "openrouter-free": (models) =>
    models
      .filter((m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0" && m.context_length >= 200000)
      .map((m) => ({ id: m.id, name: m.name })),
  "opencode-free": (models) =>
    models.filter((m) => m.id?.endsWith("-free")).map((m) => ({ id: m.id, name: m.id })),
};

/**
 * Fetch models from a provider's modelsFetcher config (for passthrough/noAuth providers).
 */
async function fetchModelsFetcherModels(fetcher) {
  if (!fetcher?.url || !fetcher?.type) return [];
  const filter = MODELS_FETCHER_FILTERS[fetcher.type];
  if (!filter) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(fetcher.url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const json = await res.json();
    const raw = json.data ?? json.models ?? json;
    return filter(Array.isArray(raw) ? raw : []);
  } catch {
    return [];
  }
}

/**
 * GET /api/models/visibility/all
 * Returns ALL models (ignoring hidden list) for the visibility management UI.
 * Includes models from: static providers, compatible providers (remote fetch),
 * passthrough/noAuth providers (modelsFetcher), combos, custom models, and aliases.
 */
export async function GET() {
  try {
    let connections = [];
    try {
      connections = await getProviderConnections();
      connections = connections.filter((c) => c.isActive !== false);
    } catch {
      // fallback
    }

    let combos = [];
    try { combos = await getCombos(); } catch { /* ignore */ }

    let modelAliases = {};
    try { modelAliases = await getModelAliases(); } catch { /* ignore */ }

    let customModels = [];
    try { customModels = await getCustomModels(); } catch { /* ignore */ }

    const activeConnectionByProvider = new Map();
    for (const conn of connections) {
      if (!activeConnectionByProvider.has(conn.provider)) {
        activeConnectionByProvider.set(conn.provider, conn);
      }
    }

    const models = [];
    const addedIds = new Set();
    const timestamp = Math.floor(Date.now() / 1000);

    const addModel = (id, ownedBy) => {
      if (addedIds.has(id)) return;
      addedIds.add(id);
      models.push({ id, object: "model", created: timestamp, owned_by: ownedBy });
    };

    // 1. Add combos
    for (const combo of combos) {
      addModel(combo.name, "combo");
    }

    // 2. Add models from active provider connections
    if (connections.length === 0) {
      // No active providers -> return all static models
      for (const [alias, providerModels] of Object.entries(PROVIDER_MODELS)) {
        for (const model of providerModels) {
          addModel(`${alias}/${model.id}`, alias);
        }
      }
    } else {
      for (const [providerId, conn] of activeConnectionByProvider.entries()) {
        const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
        const outputAlias = (
          conn?.providerSpecificData?.prefix || getProviderAlias(providerId) || staticAlias
        ).trim();
        const providerModels = PROVIDER_MODELS[staticAlias] || PROVIDER_MODELS[providerId] || [];
        const enabledModels = conn?.providerSpecificData?.enabledModels;
        const hasExplicitEnabledModels = Array.isArray(enabledModels) && enabledModels.length > 0;
        const isCompatibleProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

        let rawModelIds = hasExplicitEnabledModels
          ? Array.from(new Set(enabledModels.filter((id) => typeof id === "string" && id.trim() !== "")))
          : providerModels.map((model) => model.id);

        // Merge custom models
        const currentIds = new Set(rawModelIds);
        const customModelIds = customModels
          .filter((m) => m.providerAlias === outputAlias || m.providerAlias === staticAlias)
          .map((m) => m.id)
          .filter((id) => !currentIds.has(id));
        if (customModelIds.length > 0) {
          rawModelIds = [...rawModelIds, ...customModelIds];
          customModelIds.forEach((id) => currentIds.add(id));
        }

        // Merge model aliases
        if (!hasExplicitEnabledModels) {
          const aliasPrefix = `${staticAlias}/`;
          const aliasModelIds = Object.entries(modelAliases)
            .filter(([aliasName, fullModel]) =>
              fullModel.startsWith(aliasPrefix) && aliasName === fullModel.slice(aliasPrefix.length)
            )
            .map(([, fullModel]) => fullModel.slice(aliasPrefix.length))
            .filter((id) => !currentIds.has(id));
          if (aliasModelIds.length > 0) {
            rawModelIds = [...rawModelIds, ...aliasModelIds];
            aliasModelIds.forEach((id) => currentIds.add(id));
          }
        } else {
          const aliasPrefixes = [`${staticAlias}/`, `${outputAlias}/`, `${providerId}/`];
          const aliasModelIds = Object.entries(modelAliases)
            .filter(([aliasName, fullModel]) =>
              aliasPrefixes.some((prefix) => fullModel.startsWith(prefix) && aliasName === fullModel.slice(prefix.length))
            )
            .map(([, fullModel]) => {
              for (const prefix of aliasPrefixes) {
                if (fullModel.startsWith(prefix)) return fullModel.slice(prefix.length);
              }
              return fullModel;
            })
            .filter((id) => !currentIds.has(id));
          if (aliasModelIds.length > 0) {
            rawModelIds = [...rawModelIds, ...aliasModelIds];
            aliasModelIds.forEach((id) => currentIds.add(id));
          }
        }

        // For compatible providers with no models, fetch remote
        if (isCompatibleProvider && rawModelIds.length === 0 && !UPSTREAM_CONNECTION_RE.test(providerId)) {
          rawModelIds = await fetchCompatibleModelIds(conn);
        }

        const modelIds = rawModelIds
          .map((modelId) => {
            if (modelId.startsWith(`${outputAlias}/`)) return modelId.slice(outputAlias.length + 1);
            if (modelId.startsWith(`${staticAlias}/`)) return modelId.slice(staticAlias.length + 1);
            if (modelId.startsWith(`${providerId}/`)) return modelId.slice(providerId.length + 1);
            return modelId;
          })
          .filter((id) => typeof id === "string" && id.trim() !== "");

        for (const modelId of modelIds) {
          addModel(`${outputAlias}/${modelId}`, outputAlias);
        }
      }
    }

    // 3. Add models from FREE_PROVIDERS with modelsFetcher (passthrough/noAuth like OpenCode)
    const connectedProviderIds = new Set(activeConnectionByProvider.keys());
    const fetcherPromises = [];

    for (const [providerId, providerInfo] of Object.entries(FREE_PROVIDERS)) {
      if (!providerInfo.modelsFetcher) continue;
      // Skip if already handled via connections
      if (connectedProviderIds.has(providerId)) continue;

      const alias = providerInfo.alias || providerId;
      fetcherPromises.push(
        fetchModelsFetcherModels(providerInfo.modelsFetcher).then((fetchedModels) => {
          for (const m of fetchedModels) {
            addModel(`${alias}/${m.id}`, alias);
          }
        })
      );
    }

    // Also check APIKEY_PROVIDERS for modelsFetcher
    const { APIKEY_PROVIDERS } = await import("@/shared/constants/providers");
    for (const [providerId, providerInfo] of Object.entries(APIKEY_PROVIDERS)) {
      if (!providerInfo.modelsFetcher) continue;
      if (connectedProviderIds.has(providerId)) continue;

      const alias = providerInfo.alias || providerId;
      fetcherPromises.push(
        fetchModelsFetcherModels(providerInfo.modelsFetcher).then((fetchedModels) => {
          for (const m of fetchedModels) {
            addModel(`${alias}/${m.id}`, alias);
          }
        })
      );
    }

    await Promise.all(fetcherPromises);

    // 4. Also add passthrough provider models from modelAliases
    // (for providers that have passthroughModels and user has added models via UI)
    for (const [, fullModel] of Object.entries(modelAliases)) {
      if (fullModel.includes("/")) {
        const prefix = fullModel.split("/")[0];
        addModel(fullModel, prefix);
      }
    }

    // 5. Custom models for providers without active connections
    for (const cm of customModels) {
      addModel(`${cm.providerAlias}/${cm.id}`, cm.providerAlias);
    }

    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching all models for visibility:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
