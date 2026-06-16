import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getAllCounters, getCurrentPeriod, getNextResetDate } from "@/lib/quotaDb";

export async function GET() {
  const apiKeys = await getApiKeys();
  const { counters } = getAllCounters();

  const keys = apiKeys
    .filter((k) => k.quota && k.isActive !== false)
    .map((k) => {
      const counter = counters[k.id] || { totalTokens: 0, totalCost: 0 };
      const quota = k.quota;

      const tokensPercent = quota.maxTokens
        ? Math.round((counter.totalTokens / quota.maxTokens) * 1000) / 10
        : 0;
      const costPercent = quota.maxCost
        ? Math.round((counter.totalCost / quota.maxCost) * 1000) / 10
        : 0;

      const maxPercent = Math.max(tokensPercent, costPercent);
      const threshold = (quota.warningThreshold || 0.8) * 100;
      let status = "ok";
      if (maxPercent >= 100) status = "exceeded";
      else if (maxPercent >= threshold) status = "warning";

      return {
        keyId: k.id,
        name: k.name,
        percentage: { tokens: tokensPercent, cost: costPercent },
        status,
      };
    });

  return NextResponse.json({
    period: getCurrentPeriod(),
    resetsAt: getNextResetDate(),
    keys,
  });
}
