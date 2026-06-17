'use client';
import { useState, useEffect, useCallback } from 'react';
import Card from '@/shared/components/Card.js';

const STATUS_CONFIG = {
  healthy:   { color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-500',  label: 'Healthy' },
  degraded:  { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500', label: 'Degraded' },
  unhealthy: { color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-500',    label: 'Unhealthy' },
  unknown:   { color: 'text-gray-500',                        bg: 'bg-gray-400',   label: 'No data' },
};

export default function HealthPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.status === 401) { setError('Authentication required'); return; }
      if (!res.ok) throw new Error('Failed to load health data');
      const data = await res.json();
      // Sort: unhealthy first for visibility, then by status severity
      const order = { unhealthy: 0, degraded: 1, healthy: 2, unknown: 3 };
      setProviders(data.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3)));
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 30s
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const formatLatency = (ms) => ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
  const formatTime = (ts) => ts == null ? '—' : new Date(ts).toLocaleTimeString();
  const formatRate = (r) => r == null ? '—' : `${(r * 100).toFixed(1)}%`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Provider Health</h1>
          {lastRefresh && (
            <p className="text-xs text-text-muted mt-0.5">
              Last updated: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s
            </p>
          )}
        </div>
        <button
          onClick={fetchHealth}
          className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-text-muted text-sm">Loading health data...</div>
      ) : providers.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-text-muted text-sm">
            <span className="material-symbols-outlined text-[48px] mb-2 block">monitor_heart</span>
            No health data yet. Make some requests to start tracking provider health.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => {
            const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.unknown;
            return (
              <Card key={p.providerId}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.bg}`} />
                    <span className="font-medium text-sm truncate">{p.providerId}</span>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-text-muted">Success rate</p>
                    <p className="font-medium">{formatRate(p.successRate)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Avg latency</p>
                    <p className="font-medium">{formatLatency(p.avgLatencyMs)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">p50 / p95</p>
                    <p className="font-medium">{formatLatency(p.p50LatencyMs)} / {formatLatency(p.p95LatencyMs)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Requests</p>
                    <p className="font-medium">{p.totalRequests ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Failures</p>
                    <p className={`font-medium ${p.consecutiveFailures > 0 ? 'text-error' : ''}`}>
                      {p.consecutiveFailures} consecutive
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">Last success</p>
                    <p className="font-medium">{formatTime(p.lastSuccess)}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
