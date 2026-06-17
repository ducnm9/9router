"use client";
import { useState, useEffect } from "react";
import Card from "@/shared/components/Card.js";

export default function PluginsPage() {
  const [data, setData] = useState({ plugins: [], hooks: {} });
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlugins = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plugins");
      if (res.status === 401) { setError("Authentication required"); return; }
      if (!res.ok) throw new Error("Failed to load plugins");
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlugins(); }, []);

  const handleReload = async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await fetchPlugins();
    } catch (e) {
      alert(e.message);
    } finally {
      setReloading(false);
    }
  };

  const statusBadge = (status) => {
    const styles = {
      loaded:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      disabled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      error:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.disabled}`}>
        {status}
      </span>
    );
  };

  const hookCount = Object.values(data.hooks).reduce((sum, handlers) => sum + handlers.length, 0);
  const activeHooks = Object.entries(data.hooks).filter(([, handlers]) => handlers.length > 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Plugins</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Plugins are loaded from the{" "}
            <code className="bg-surface-secondary px-1 rounded">plugins/</code>{" "}
            directory at startup
          </p>
        </div>
        <button
          onClick={handleReload}
          disabled={reloading}
          className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover disabled:opacity-50"
        >
          {reloading ? "Reloading..." : "Reload Plugins"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-text-muted text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Plugins list */}
          <Card>
            <h2 className="font-semibold text-sm mb-3">
              Installed Plugins ({data.plugins.length})
            </h2>
            {data.plugins.length === 0 ? (
              <div className="py-6 text-center text-text-muted text-sm">
                <span className="material-symbols-outlined text-[40px] mb-1 block">extension</span>
                No plugins found. Add a plugin to the{" "}
                <code className="bg-surface-secondary px-1 rounded">plugins/</code> directory.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.plugins.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between gap-3 p-3 border border-border/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-xs text-text-muted">v{p.version}</span>
                      </div>
                      {p.description && (
                        <p className="text-xs text-text-muted">{p.description}</p>
                      )}
                      {p.error && (
                        <p className="text-xs text-error mt-1">{p.error}</p>
                      )}
                    </div>
                    {statusBadge(p.status)}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Active hooks */}
          {hookCount > 0 && (
            <Card>
              <h2 className="font-semibold text-sm mb-3">
                Active Hooks ({hookCount} registered)
              </h2>
              <div className="flex flex-col gap-2">
                {activeHooks.map(([hookName, handlers]) => (
                  <div key={hookName} className="flex items-center gap-3 text-xs">
                    <code className="w-36 shrink-0 bg-surface-secondary px-1.5 py-0.5 rounded text-primary">
                      {hookName}
                    </code>
                    <span className="text-text-muted">
                      {handlers.map((h) => h.pluginId).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Usage guide */}
          <Card>
            <h2 className="font-semibold text-sm mb-3">How to create a plugin</h2>
            <ol className="text-xs text-text-muted flex flex-col gap-1.5 list-decimal list-inside">
              <li>
                Create a directory under{" "}
                <code className="bg-surface-secondary px-1 rounded">plugins/your-plugin/</code>
              </li>
              <li>
                Add a <code className="bg-surface-secondary px-1 rounded">manifest.json</code> with{" "}
                <code className="bg-surface-secondary px-1 rounded">id</code>,{" "}
                <code className="bg-surface-secondary px-1 rounded">name</code>, and{" "}
                <code className="bg-surface-secondary px-1 rounded">&quot;enabled&quot;: true</code>
              </li>
              <li>
                Create <code className="bg-surface-secondary px-1 rounded">index.js</code> exporting{" "}
                <code className="bg-surface-secondary px-1 rounded">
                  register(&#123;registerHook, pluginId&#125;)
                </code>
              </li>
              <li>Click &quot;Reload Plugins&quot; or restart the server</li>
            </ol>
            <p className="text-xs text-text-muted mt-2">
              See{" "}
              <code className="bg-surface-secondary px-1 rounded">plugins/example/</code> for a
              working example.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
