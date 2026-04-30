"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, Button, Input, Badge } from "@/shared/components";
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { AI_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import ProviderIcon from "@/shared/components/ProviderIcon";

export default function ModelVisibilityPage() {
  const [hiddenModels, setHiddenModels] = useState([]);
  const [allModels, setAllModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all | visible | hidden
  const [pendingChanges, setPendingChanges] = useState(new Set());
  const [initialHidden, setInitialHidden] = useState(new Set());

  // Fetch all data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [modelsRes, visibilityRes] = await Promise.all([
          fetch("/api/v1/models"),
          fetch("/api/models/visibility"),
        ]);

        // Get all models from /v1/models (this returns currently visible ones)
        // We also need to build the full list including hidden ones
        const visibilityData = await visibilityRes.json();
        const hidden = new Set(visibilityData.hiddenModels || []);
        setHiddenModels(visibilityData.hiddenModels || []);
        setInitialHidden(hidden);

        // Build full model list from all active providers + combos
        const fullModelsRes = await fetch("/api/models/visibility/all");
        const fullModelsData = await fullModelsRes.json();
        setAllModels(fullModelsData.models || []);
      } catch (error) {
        console.error("Error fetching model visibility data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const hiddenSet = useMemo(() => new Set(hiddenModels), [hiddenModels]);

  // Get unique providers from all models
  const providers = useMemo(() => {
    const providerMap = new Map();
    for (const model of allModels) {
      if (!providerMap.has(model.owned_by)) {
        providerMap.set(model.owned_by, model.owned_by);
      }
    }
    return Array.from(providerMap.keys()).sort();
  }, [allModels]);

  // Filter models
  const filteredModels = useMemo(() => {
    return allModels.filter((model) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!model.id.toLowerCase().includes(q) && !model.owned_by.toLowerCase().includes(q)) {
          return false;
        }
      }
      // Provider filter
      if (filterProvider !== "all" && model.owned_by !== filterProvider) {
        return false;
      }
      // Status filter
      if (filterStatus === "visible" && hiddenSet.has(model.id)) return false;
      if (filterStatus === "hidden" && !hiddenSet.has(model.id)) return false;
      return true;
    });
  }, [allModels, searchQuery, filterProvider, filterStatus, hiddenSet]);

  // Group by provider
  const groupedModels = useMemo(() => {
    const groups = {};
    for (const model of filteredModels) {
      const provider = model.owned_by;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }
    return groups;
  }, [filteredModels]);

  const toggleModel = useCallback((modelId) => {
    setHiddenModels((prev) => {
      const set = new Set(prev);
      if (set.has(modelId)) {
        set.delete(modelId);
      } else {
        set.add(modelId);
      }
      return Array.from(set);
    });
    setPendingChanges((prev) => {
      const next = new Set(prev);
      next.add(modelId);
      return next;
    });
  }, []);

  const toggleProvider = useCallback((provider, models) => {
    const modelIds = models.map((m) => m.id);
    const allHidden = modelIds.every((id) => hiddenSet.has(id));

    setHiddenModels((prev) => {
      const set = new Set(prev);
      if (allHidden) {
        // Show all
        modelIds.forEach((id) => set.delete(id));
      } else {
        // Hide all
        modelIds.forEach((id) => set.add(id));
      }
      return Array.from(set);
    });
    setPendingChanges((prev) => {
      const next = new Set(prev);
      modelIds.forEach((id) => next.add(id));
      return next;
    });
  }, [hiddenSet]);

  const showAll = useCallback(() => {
    const allIds = allModels.map((m) => m.id);
    setHiddenModels([]);
    setPendingChanges(new Set(allIds));
  }, [allModels]);

  const hideAll = useCallback(() => {
    const allIds = allModels.map((m) => m.id);
    setHiddenModels(allIds);
    setPendingChanges(new Set(allIds));
  }, [allModels]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/models/visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenModels }),
      });
      if (res.ok) {
        setInitialHidden(new Set(hiddenModels));
        setPendingChanges(new Set());
      }
    } catch (error) {
      console.error("Error saving model visibility:", error);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = pendingChanges.size > 0;
  const visibleCount = allModels.length - hiddenModels.length;
  const hiddenCount = hiddenModels.length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-48" />
          <div className="h-12 bg-surface rounded" />
          <div className="h-64 bg-surface rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-green-500">visibility</span>
          <span className="text-sm text-text-main font-medium">{visibleCount} visible</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-text-muted">visibility_off</span>
          <span className="text-sm text-text-muted">{hiddenCount} hidden</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Total: {allModels.length}</span>
        </div>
        <div className="flex-1" />
        {hasChanges && (
          <Badge variant="warning" className="animate-pulse">Unsaved changes</Badge>
        )}
      </div>

      {/* Toolbar */}
      <Card padding="sm">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Provider filter */}
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-black/10 dark:border-white/10 bg-surface text-text-main focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-black/10 dark:border-white/10 bg-surface text-text-main focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="all">All Status</option>
            <option value="visible">Visible Only</option>
            <option value="hidden">Hidden Only</option>
          </select>

          {/* Bulk actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={showAll}>
              Show All
            </Button>
            <Button variant="outline" size="sm" onClick={hideAll}>
              Hide All
            </Button>
          </div>

          {/* Save */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            icon={saving ? "progress_activity" : "save"}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </Card>

      {/* Model list grouped by provider */}
      {Object.keys(groupedModels).length === 0 ? (
        <Card>
          <div className="text-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-[48px] mb-2 block">search_off</span>
            <p>No models match your filters</p>
          </div>
        </Card>
      ) : (
        Object.entries(groupedModels).map(([provider, models]) => {
          const allProviderHidden = models.every((m) => hiddenSet.has(m.id));
          const someProviderHidden = models.some((m) => hiddenSet.has(m.id));
          const providerVisibleCount = models.filter((m) => !hiddenSet.has(m.id)).length;

          return (
            <Card key={provider} padding="none">
              {/* Provider header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <ProviderCheckbox
                    checked={!allProviderHidden}
                    indeterminate={someProviderHidden && !allProviderHidden}
                    onChange={() => toggleProvider(provider, models)}
                  />
                  <ProviderIcon src={`/providers/${provider}.png`} alt={provider} size={20} fallbackText={provider.slice(0, 2).toUpperCase()} />
                  <span className="text-sm font-semibold text-text-main">{provider}</span>
                  <span className="text-xs text-text-muted">
                    {providerVisibleCount}/{models.length} visible
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // Show all in this provider
                      const ids = models.map((m) => m.id);
                      setHiddenModels((prev) => prev.filter((id) => !ids.includes(id)));
                      setPendingChanges((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => next.add(id));
                        return next;
                      });
                    }}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    Show all
                  </button>
                  <span className="text-text-muted">|</span>
                  <button
                    onClick={() => {
                      const ids = models.map((m) => m.id);
                      setHiddenModels((prev) => Array.from(new Set([...prev, ...ids])));
                      setPendingChanges((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => next.add(id));
                        return next;
                      });
                    }}
                    className="text-xs text-text-muted hover:text-red-500 hover:underline cursor-pointer"
                  >
                    Hide all
                  </button>
                </div>
              </div>

              {/* Model rows */}
              <div className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
                {models.map((model) => {
                  const isHidden = hiddenSet.has(model.id);
                  return (
                    <label
                      key={model.id}
                      className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${
                        isHidden ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleModel(model.id)}
                        className="w-4 h-4 rounded border-black/20 dark:border-white/20 text-primary focus:ring-primary/30 cursor-pointer accent-[var(--color-primary)]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-mono ${isHidden ? "text-text-muted line-through" : "text-text-main"}`}>
                          {model.id}
                        </span>
                      </div>
                      <span className={`material-symbols-outlined text-[16px] ${isHidden ? "text-text-muted" : "text-green-500"}`}>
                        {isHidden ? "visibility_off" : "visibility"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}

      {/* Floating save bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-4 px-6 py-3 rounded-xl bg-surface border border-black/10 dark:border-white/10 shadow-lg backdrop-blur-xl">
            <span className="text-sm text-text-muted">
              {pendingChanges.size} model{pendingChanges.size !== 1 ? "s" : ""} changed
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHiddenModels(Array.from(initialHidden));
                setPendingChanges(new Set());
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              icon={saving ? "progress_activity" : "save"}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom checkbox with indeterminate state for provider-level toggle
function ProviderCheckbox({ checked, indeterminate, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
        checked && !indeterminate
          ? "bg-primary border-primary"
          : indeterminate
            ? "bg-primary/50 border-primary/50"
            : "border-black/20 dark:border-white/20"
      }`}
    >
      {checked && !indeterminate && (
        <span className="material-symbols-outlined text-white text-[14px]">check</span>
      )}
      {indeterminate && (
        <span className="material-symbols-outlined text-white text-[14px]">remove</span>
      )}
    </button>
  );
}
