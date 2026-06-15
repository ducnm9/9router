"use client";

import { useState, useEffect, useRef } from "react";
import { Card, SegmentedControl } from "@/shared/components";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --- Helpers ---

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function buildRtkLineData(recentEvents) {
  return recentEvents.slice(-100).map((ev, i) => ({
    index: i + 1,
    bytesSaved: Math.max(0, (ev.bytesBefore || 0) - (ev.bytesAfter || 0)),
    compressionPct: ev.ratio != null ? +(ev.ratio * 100).toFixed(1) : 0,
  }));
}

function buildFilterBarData(hitsByFilter) {
  return Object.entries(hitsByFilter || {})
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));
}

function buildLevelPieData(countByLevel) {
  return Object.entries(countByLevel || {})
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));
}

const PIE_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe",
];

const EMPTY_RTK = {
  aggregates: {
    totalBytesBefore: 0,
    totalBytesAfter: 0,
    compressionPct: 0,
    totalHits: 0,
    hitsByFilter: {},
  },
  recentEvents: [],
};

const EMPTY_CAVEMAN = {
  aggregates: {
    totalRequests: 0,
    countByLevel: {},
    countByFormat: {},
  },
  recentEvents: [],
};

// --- Sub-components ---

function StatItem({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-bold text-text-main">{value}</span>
    </div>
  );
}

function FetchWarning() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
      <span className="material-symbols-outlined text-[14px]">warning</span>
      Showing last known data — refresh failed
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
      <span className="material-symbols-outlined text-[36px]">bar_chart</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

function RtkView({ rtk }) {
  const { aggregates, recentEvents } = rtk;
  const bytesSaved = (aggregates.totalBytesBefore || 0) - (aggregates.totalBytesAfter || 0);
  const lineData = buildRtkLineData(recentEvents);
  const barData = buildFilterBarData(aggregates.hitsByFilter);
  const hasTimeSeries = lineData.length >= 2;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary card */}
      <Card title="RTK Compression Summary" icon="compress">
        <div className="grid grid-cols-3 gap-6 mt-2">
          <StatItem label="Total Bytes Saved" value={formatBytes(Math.max(0, bytesSaved))} />
          <StatItem label="Compression %" value={`${(aggregates.compressionPct || 0).toFixed(1)}%`} />
          <StatItem label="Total Filter Hits" value={(aggregates.totalHits || 0).toLocaleString()} />
        </div>
      </Card>

      {/* Bytes saved per request */}
      <Card title="Bytes Saved per Request" subtitle="Last 100 events" icon="trending_down">
        {hasTimeSeries ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatBytes(v)}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                formatter={(value) => [formatBytes(value), "Bytes Saved"]}
                labelFormatter={(label) => `Request #${label}`}
              />
              <Line
                type="monotone"
                dataKey="bytesSaved"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Chart will appear after 2+ requests are processed" />
        )}
      </Card>

      {/* Compression ratio % */}
      <Card title="Compression Ratio" subtitle="Last 100 events" icon="percent">
        {hasTimeSeries ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, "Compression Ratio"]}
                labelFormatter={(label) => `Request #${label}`}
              />
              <Line
                type="monotone"
                dataKey="compressionPct"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Chart will appear after 2+ requests are processed" />
        )}
      </Card>

      {/* Filter hit distribution */}
      <Card title="Filter Hit Distribution" subtitle="All-time" icon="filter_list">
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip formatter={(value) => [value, "Hits"]} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No filter hits recorded yet" />
        )}
      </Card>
    </div>
  );
}

function CavemanView({ caveman }) {
  const { aggregates } = caveman;
  const pieData = buildLevelPieData(aggregates.countByLevel);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary card */}
      <Card title="Caveman Summary" icon="psychology">
        <div className="grid grid-cols-2 gap-6 mt-2">
          <StatItem label="Total Requests" value={(aggregates.totalRequests || 0).toLocaleString()} />
          <StatItem
            label="Active Levels"
            value={pieData.length > 0 ? pieData.map((d) => d.name).join(", ") : "—"}
          />
        </div>

        {/* Level distribution inline table */}
        {pieData.length > 0 && (
          <div className="mt-4 flex flex-col gap-1">
            {pieData.map((d) => {
              const pct = aggregates.totalRequests > 0
                ? ((d.count / aggregates.totalRequests) * 100).toFixed(1)
                : 0;
              return (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-sm text-text-muted w-28 shrink-0">{d.name}</span>
                  <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-text-muted w-12 text-right">{d.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Level distribution pie chart */}
      <Card title="Level Distribution" subtitle="All-time" icon="donut_large">
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={48}
                paddingAngle={2}
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine
              >
                {pieData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No Caveman requests recorded yet" />
        )}
      </Card>
    </div>
  );
}

// --- Main page ---

export default function RtkMonitorPage() {
  const [activeTab, setActiveTab] = useState("rtk");
  const [rtkData, setRtkData] = useState(EMPTY_RTK);
  const [cavemanData, setCavemanData] = useState(EMPTY_CAVEMAN);
  const [fetchError, setFetchError] = useState(false);

  // Keep last-known-good data on errors
  const lastRtkRef = useRef(EMPTY_RTK);
  const lastCavemanRef = useRef(EMPTY_CAVEMAN);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [rtkRes, cavemanRes] = await Promise.all([
          fetch("/api/rtk-metrics"),
          fetch("/api/caveman-metrics"),
        ]);

        if (!cancelled && rtkRes.ok && cavemanRes.ok) {
          const rtk = await rtkRes.json();
          const caveman = await cavemanRes.json();
          lastRtkRef.current = rtk;
          lastCavemanRef.current = caveman;
          setRtkData(rtk);
          setCavemanData(caveman);
          setFetchError(false);
        } else if (!cancelled) {
          // Non-OK response — show last known data + warning
          setFetchError(true);
        }
      } catch {
        if (!cancelled) {
          // Network error — show last known data + warning
          setFetchError(true);
        }
      }
    }

    // Initial fetch
    poll();

    // 2-second polling
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SegmentedControl
          options={[
            { value: "rtk", label: "RTK Compression" },
            { value: "caveman", label: "Caveman" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
        {fetchError && <FetchWarning />}
      </div>

      {activeTab === "rtk" && <RtkView rtk={rtkData} />}
      {activeTab === "caveman" && <CavemanView caveman={cavemanData} />}
    </div>
  );
}
