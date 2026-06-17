"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, Button } from "@/shared/components";

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ action: "", resource: "", limit: 50, offset: 0 });
  const [expanded, setExpanded] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.resource) params.set("resource", filters.resource);
      params.set("limit", filters.limit);
      params.set("offset", filters.offset);

      const res = await fetch(`/api/audit?${params}`);
      if (res.status === 403) {
        setError("Admin access required to view audit log.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load audit log");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actionColor = (action) => {
    if (action?.startsWith("key.")) return "text-blue-600 dark:text-blue-400";
    if (action?.startsWith("user.")) return "text-purple-600 dark:text-purple-400";
    if (action?.startsWith("settings.")) return "text-orange-600 dark:text-orange-400";
    if (action === "chat.request") return "text-green-600 dark:text-green-400";
    return "text-text-muted";
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <Button variant="outline" onClick={fetchLogs} icon="refresh">
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Filter by action (e.g. key.created)"
          value={filters.action}
          onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value, offset: 0 }))}
          className="px-3 py-1.5 text-sm border rounded-lg bg-surface-secondary border-border flex-1 min-w-40"
        />
        <input
          type="text"
          placeholder="Filter by resource"
          value={filters.resource}
          onChange={(e) => setFilters((p) => ({ ...p, resource: e.target.value, offset: 0 }))}
          className="px-3 py-1.5 text-sm border rounded-lg bg-surface-secondary border-border w-40"
        />
      </div>

      <Card>
        {loading ? (
          <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">No audit events found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium w-36">Time</th>
                  <th className="pb-2 pr-4 font-medium w-36">Action</th>
                  <th className="pb-2 pr-4 font-medium">Resource</th>
                  <th className="pb-2 pr-4 font-medium">User</th>
                  <th className="pb-2 pr-4 font-medium">IP</th>
                  <th className="pb-2 font-medium w-16">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="border-b border-border/50 last:border-0 hover:bg-surface-hover/30">
                      <td className="py-2 pr-4 text-text-muted whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className={`py-2 pr-4 font-mono text-xs ${actionColor(log.action)}`}>
                        {log.action}
                      </td>
                      <td className="py-2 pr-4 text-text-muted">
                        {log.resource}{log.resourceId ? ` (${log.resourceId.slice(0, 8)}…)` : ""}
                      </td>
                      <td className="py-2 pr-4 text-text-muted">
                        {log.userId ? log.userId.slice(0, 8) + "…" : "—"}
                      </td>
                      <td className="py-2 pr-4 text-text-muted">{log.ip || "—"}</td>
                      <td className="py-2">
                        {log.details && (
                          <button
                            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            {expanded === log.id ? "hide" : "show"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr className="border-b border-border/50">
                        <td colSpan={6} className="pb-2 pt-0 pl-2">
                          <pre className="text-xs bg-surface-secondary rounded p-2 overflow-x-auto text-text-muted">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex gap-2 mt-4 justify-end items-center text-sm">
        <span className="text-text-muted">{logs.length} events shown</span>
        {filters.offset > 0 && (
          <button
            onClick={() => setFilters((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            className="px-3 py-1 border border-border rounded hover:bg-surface-hover"
          >
            Previous
          </button>
        )}
        {logs.length === filters.limit && (
          <button
            onClick={() => setFilters((p) => ({ ...p, offset: p.offset + p.limit }))}
            className="px-3 py-1 border border-border rounded hover:bg-surface-hover"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
