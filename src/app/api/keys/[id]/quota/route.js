import { NextResponse } from "next/server";
import { getApiKeyById, updateApiKey } from "@/lib/localDb";
import { getCounter, checkQuota, getNextResetDate, getCurrentPeriod } from "@/lib/quotaDb";

export async function GET(request, { params }) {
  const { id } = await params;
  const keyConfig = await getApiKeyById(id);

  if (!keyConfig) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  const counter = await getCounter(id);
  const quota = keyConfig.quota || null;

  const tokensPercent = quota?.maxTokens
    ? Math.round((counter.totalTokens / quota.maxTokens) * 1000) / 10
    : 0;
  const costPercent = quota?.maxCost
    ? Math.round((counter.totalCost / quota.maxCost) * 1000) / 10
    : 0;

  return NextResponse.json({
    keyId: id,
    quota,
    usage: { totalTokens: counter.totalTokens, totalCost: counter.totalCost },
    percentage: { tokens: tokensPercent, cost: costPercent },
    period: getCurrentPeriod(),
    resetsAt: getNextResetDate(),
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const keyConfig = await getApiKeyById(id);

  if (!keyConfig) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  const body = await request.json();
  const { maxTokens, maxCost, warningThreshold } = body;

  // Validation
  if (maxTokens !== null && maxTokens !== undefined) {
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      return NextResponse.json(
        { error: "maxTokens must be a positive integer or null" },
        { status: 400 }
      );
    }
  }
  if (maxCost !== null && maxCost !== undefined) {
    if (typeof maxCost !== "number" || maxCost <= 0) {
      return NextResponse.json(
        { error: "maxCost must be a positive number or null" },
        { status: 400 }
      );
    }
  }
  if (warningThreshold !== undefined) {
    if (typeof warningThreshold !== "number" || warningThreshold < 0.1 || warningThreshold > 0.99) {
      return NextResponse.json(
        { error: "warningThreshold must be between 0.1 and 0.99" },
        { status: 400 }
      );
    }
  }

  const quota = {
    maxTokens: maxTokens ?? null,
    maxCost: maxCost ?? null,
    warningThreshold: warningThreshold ?? 0.8,
  };

  await updateApiKey(id, { quota });

  return NextResponse.json({ keyId: id, quota });
}
