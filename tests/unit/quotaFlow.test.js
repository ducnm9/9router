import { describe, it, expect, beforeEach } from "vitest";
import { checkQuota, getCounter, incrementCounter, resetCounter } from "@/lib/quotaDb";

describe("Quota enforcement flow", () => {
  const TEST_KEY = "key_test_flow_" + Date.now();

  beforeEach(async () => {
    await resetCounter(TEST_KEY);
  });

  it("allows request when under quota", async () => {
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("shows warning after threshold crossed (tokens)", async () => {
    await incrementCounter(TEST_KEY, { tokens: 850000, cost: 2.0 });
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
    expect(result.usage.totalTokens).toBe(850000);
    expect(result.limit.maxTokens).toBe(1000000);
    expect(result.resetsAt).toBeDefined();
  });

  it("shows warning after threshold crossed (cost)", async () => {
    await incrementCounter(TEST_KEY, { tokens: 100000, cost: 4.5 });
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("blocks request after token quota exceeded", async () => {
    await incrementCounter(TEST_KEY, { tokens: 1000001, cost: 3.0 });
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(false);
    expect(result.usage.totalTokens).toBe(1000001);
    expect(result.limit.maxTokens).toBe(1000000);
  });

  it("blocks request after cost quota exceeded", async () => {
    await incrementCounter(TEST_KEY, { tokens: 500000, cost: 5.01 });
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(false);
    expect(result.usage.totalCost).toBe(5.01);
    expect(result.limit.maxCost).toBe(5.0);
  });

  it("resets counter and allows again", async () => {
    await incrementCounter(TEST_KEY, { tokens: 1000001, cost: 6.0 });
    await resetCounter(TEST_KEY);
    const counter = await getCounter(TEST_KEY);
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(counter.totalTokens).toBe(0);
    expect(counter.totalCost).toBe(0);
  });

  it("incremental usage accumulates correctly", async () => {
    await incrementCounter(TEST_KEY, { tokens: 200000, cost: 1.0 });
    await incrementCounter(TEST_KEY, { tokens: 300000, cost: 1.5 });
    await incrementCounter(TEST_KEY, { tokens: 100000, cost: 0.5 });
    const counter = await getCounter(TEST_KEY);
    expect(counter.totalTokens).toBe(600000);
    expect(counter.totalCost).toBeCloseTo(3.0);
  });
});
