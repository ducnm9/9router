import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp directory for tests
const TEST_DATA_DIR = path.join(os.tmpdir(), `9router-quota-test-${process.pid}`);
const QUOTA_FILE = path.join(TEST_DATA_DIR, "quota.json");

// Mock the dataDir module before importing quotaDb
vi.mock("@/lib/dataDir.js", () => ({
  DATA_DIR: path.join(os.tmpdir(), `9router-quota-test-${process.pid}`),
  getDataDir: () => path.join(os.tmpdir(), `9router-quota-test-${process.pid}`),
}));

// Dynamic import after mock is set up
const {
  getCounter,
  incrementCounter,
  resetCounter,
  getAllCounters,
  checkQuota,
  getCurrentPeriod,
  getNextResetDate,
} = await import("@/lib/quotaDb.js");

describe("quotaDb", () => {
  beforeEach(() => {
    // Clean slate for each test
    if (fs.existsSync(QUOTA_FILE)) {
      fs.unlinkSync(QUOTA_FILE);
    }
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(QUOTA_FILE)) {
      fs.unlinkSync(QUOTA_FILE);
    }
  });

  // -------------------------------------------------------------------------
  // getCurrentPeriod / getNextResetDate
  // -------------------------------------------------------------------------

  describe("getCurrentPeriod", () => {
    it("returns YYYY-MM format", () => {
      const period = getCurrentPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });

    it("matches the current date", () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(getCurrentPeriod()).toBe(expected);
    });
  });

  describe("getNextResetDate", () => {
    it("returns an ISO date string", () => {
      const date = getNextResetDate();
      expect(new Date(date).toISOString()).toBe(date);
    });

    it("returns the 1st of the next month", () => {
      const date = new Date(getNextResetDate());
      expect(date.getUTCDate()).toBe(1);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getCounter
  // -------------------------------------------------------------------------

  describe("getCounter", () => {
    it("returns zero for unknown key", () => {
      const counter = getCounter("unknown_key");
      expect(counter.totalTokens).toBe(0);
      expect(counter.totalCost).toBe(0);
      expect(counter.lastUpdated).toBeNull();
    });

    it("returns existing counter", () => {
      // Seed the file
      const data = {
        period: getCurrentPeriod(),
        counters: {
          key_abc123: {
            totalTokens: 10000,
            totalCost: 1.5,
            lastUpdated: "2025-07-10T14:30:00Z",
          },
        },
      };
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(data), "utf-8");

      const counter = getCounter("key_abc123");
      expect(counter.totalTokens).toBe(10000);
      expect(counter.totalCost).toBe(1.5);
      expect(counter.lastUpdated).toBe("2025-07-10T14:30:00Z");
    });

    it("resets when period changes (old month → current month)", () => {
      // Seed with a past period
      const data = {
        period: "2024-01",
        counters: {
          key_old: {
            totalTokens: 999999,
            totalCost: 99.99,
            lastUpdated: "2024-01-15T00:00:00Z",
          },
        },
      };
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(data), "utf-8");

      const counter = getCounter("key_old");
      expect(counter.totalTokens).toBe(0);
      expect(counter.totalCost).toBe(0);
      expect(counter.lastUpdated).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // incrementCounter
  // -------------------------------------------------------------------------

  describe("incrementCounter", () => {
    it("adds tokens and cost correctly", async () => {
      await incrementCounter("key_inc", { tokens: 500, cost: 0.25 });

      const counter = getCounter("key_inc");
      expect(counter.totalTokens).toBe(500);
      expect(counter.totalCost).toBe(0.25);
      expect(counter.lastUpdated).not.toBeNull();
    });

    it("handles multiple increments", async () => {
      await incrementCounter("key_multi", { tokens: 100, cost: 0.1 });
      await incrementCounter("key_multi", { tokens: 200, cost: 0.2 });
      await incrementCounter("key_multi", { tokens: 300, cost: 0.3 });

      const counter = getCounter("key_multi");
      expect(counter.totalTokens).toBe(600);
      // Check cost with floating point tolerance
      expect(counter.totalCost).toBeCloseTo(0.6, 8);
    });

    it("handles floating point precision for cost", async () => {
      // 0.1 + 0.2 is a classic float precision issue
      await incrementCounter("key_float", { tokens: 0, cost: 0.1 });
      await incrementCounter("key_float", { tokens: 0, cost: 0.2 });

      const counter = getCounter("key_float");
      expect(counter.totalCost).toBeCloseTo(0.3, 10);
      // Should not be 0.30000000000000004
      expect(String(counter.totalCost).length).toBeLessThan(10);
    });
  });

  // -------------------------------------------------------------------------
  // resetCounter
  // -------------------------------------------------------------------------

  describe("resetCounter", () => {
    it("zeros the counter", async () => {
      await incrementCounter("key_reset", { tokens: 5000, cost: 3.5 });
      const before = getCounter("key_reset");
      expect(before.totalTokens).toBe(5000);

      await resetCounter("key_reset");

      const after = getCounter("key_reset");
      expect(after.totalTokens).toBe(0);
      expect(after.totalCost).toBe(0);
      expect(after.lastUpdated).not.toBeNull(); // lastUpdated is set to now
    });
  });

  // -------------------------------------------------------------------------
  // getAllCounters
  // -------------------------------------------------------------------------

  describe("getAllCounters", () => {
    it("returns period and counters object", async () => {
      await incrementCounter("key_a", { tokens: 100, cost: 0.01 });
      await incrementCounter("key_b", { tokens: 200, cost: 0.02 });

      const all = getAllCounters();
      expect(all.period).toBe(getCurrentPeriod());
      expect(all.counters.key_a).toBeDefined();
      expect(all.counters.key_b).toBeDefined();
      expect(all.counters.key_a.totalTokens).toBe(100);
      expect(all.counters.key_b.totalTokens).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // checkQuota
  // -------------------------------------------------------------------------

  describe("checkQuota", () => {
    it("returns allowed=true when under limit", () => {
      const counter = { totalTokens: 5000, totalCost: 1.0 };
      const quota = { maxTokens: 100000, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(false);
    });

    it("returns warning=true at threshold", () => {
      const counter = { totalTokens: 85000, totalCost: 1.0 };
      const quota = { maxTokens: 100000, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(true);
      expect(result.usage).toBe(85000);
      expect(result.limit).toBe(100000);
      expect(result.resetsAt).toBeDefined();
    });

    it("returns allowed=false when exceeded (tokens)", () => {
      const counter = { totalTokens: 100000, totalCost: 1.0 };
      const quota = { maxTokens: 100000, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(false);
      expect(result.usage).toBe(100000);
      expect(result.limit).toBe(100000);
      expect(result.resetsAt).toBeDefined();
    });

    it("returns allowed=false when exceeded (cost)", () => {
      const counter = { totalTokens: 5000, totalCost: 10.0 };
      const quota = { maxTokens: 100000, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(false);
      expect(result.usage).toBe(10.0);
      expect(result.limit).toBe(10.0);
    });

    it("returns allowed=true for null quota (unlimited)", () => {
      const counter = { totalTokens: 999999999, totalCost: 999999 };
      const result = checkQuota(counter, null);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(false);
    });

    it("returns allowed=true for undefined quota (unlimited)", () => {
      const counter = { totalTokens: 999999999, totalCost: 999999 };
      const result = checkQuota(counter, undefined);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(false);
    });

    it("ignores null maxTokens (only checks cost)", () => {
      const counter = { totalTokens: 999999999, totalCost: 5.0 };
      const quota = { maxTokens: null, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      // Tokens are unlimited, cost is under limit
      expect(result.allowed).toBe(true);
      // Cost is at 50% which is under 80% threshold
      expect(result.warning).toBe(false);
    });

    it("ignores null maxCost (only checks tokens)", () => {
      const counter = { totalTokens: 50000, totalCost: 999999 };
      const quota = { maxTokens: 100000, maxCost: null, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      // Cost is unlimited, tokens are under limit
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(false);
    });

    it("blocks when only token limit is set and exceeded", () => {
      const counter = { totalTokens: 100000, totalCost: 999999 };
      const quota = { maxTokens: 100000, maxCost: null, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(false);
      expect(result.usage).toBe(100000);
      expect(result.limit).toBe(100000);
    });

    it("blocks when only cost limit is set and exceeded", () => {
      const counter = { totalTokens: 999999, totalCost: 10.0 };
      const quota = { maxTokens: null, maxCost: 10.0, warningThreshold: 0.8 };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(false);
      expect(result.usage).toBe(10.0);
      expect(result.limit).toBe(10.0);
    });

    it("uses default warningThreshold of 0.8 when not specified", () => {
      const counter = { totalTokens: 81000, totalCost: 0 };
      const quota = { maxTokens: 100000, maxCost: null };
      const result = checkQuota(counter, quota);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBe(true);
    });
  });
});
