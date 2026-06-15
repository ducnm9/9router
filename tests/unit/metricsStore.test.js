import { describe, it, expect, beforeEach } from "vitest";
import {
  CircularBuffer,
  recordRtk,
  getRtkSummary,
  getRtkTimeSeries,
  recordCaveman,
  getCavemanSummary,
  getCavemanTimeSeries,
} from "../../open-sse/rtk/metricsStore.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(bytesBefore, bytesAfter, hits = []) {
  return { bytesBefore, bytesAfter, hits };
}

function makeHit(filter = "git-diff", shape = "openai-tool", saved = 100) {
  return { filter, shape, saved };
}

function makeCavemanInput(level = "full", model = "gpt-4o", outputTokens = 200, format = "openai") {
  return { level, model, outputTokens, format };
}

// ---------------------------------------------------------------------------
// CircularBuffer
// ---------------------------------------------------------------------------

describe("CircularBuffer", () => {
  it("starts empty", () => {
    const buf = new CircularBuffer(10);
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("length getter reflects current size", () => {
    const buf = new CircularBuffer(5);
    buf.push("a");
    buf.push("b");
    expect(buf.length).toBe(2);
  });

  it("toArray returns items in insertion order", () => {
    const buf = new CircularBuffer(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  it("capacity invariant: size never exceeds capacity", () => {
    const buf = new CircularBuffer(3);
    for (let i = 0; i < 10; i++) buf.push(i);
    expect(buf.length).toBe(3);
  });

  it("evicts oldest item when full (wraps correctly)", () => {
    const buf = new CircularBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    buf.push("d"); // should evict "a"
    expect(buf.toArray()).toEqual(["b", "c", "d"]);
  });

  it("maintains insertion order after multiple wraps", () => {
    const buf = new CircularBuffer(3);
    for (let i = 0; i < 7; i++) buf.push(i);
    // Should contain the last 3 items: 4, 5, 6
    expect(buf.toArray()).toEqual([4, 5, 6]);
  });

  it("last(n) returns most recent N items", () => {
    const buf = new CircularBuffer(10);
    for (let i = 0; i < 5; i++) buf.push(i);
    expect(buf.last(3)).toEqual([2, 3, 4]);
  });

  it("last(n) returns all when n >= size", () => {
    const buf = new CircularBuffer(10);
    buf.push(1);
    buf.push(2);
    expect(buf.last(100)).toEqual([1, 2]);
  });

  it("last(0) returns empty array", () => {
    const buf = new CircularBuffer(10);
    buf.push(1);
    expect(buf.last(0)).toEqual([]);
  });

  it("last(n) works after buffer wraps", () => {
    const buf = new CircularBuffer(5);
    for (let i = 0; i < 8; i++) buf.push(i);
    // Buffer holds [3,4,5,6,7]
    expect(buf.last(2)).toEqual([6, 7]);
  });

  it("capacity of 1 keeps only the most recent item", () => {
    const buf = new CircularBuffer(1);
    buf.push("first");
    buf.push("second");
    expect(buf.length).toBe(1);
    expect(buf.toArray()).toEqual(["second"]);
  });
});

// ---------------------------------------------------------------------------
// RTK metrics — isolation helpers
// ---------------------------------------------------------------------------

// The metrics store is a singleton — we need to snapshot state before/after
// to avoid test-ordering issues. We test incremental behavior by recording
// before and comparing deltas.

describe("recordRtk", () => {
  it("null input is a no-op (does not throw, does not add events)", () => {
    const before = getRtkSummary();
    recordRtk(null);
    const after = getRtkSummary();
    expect(after.aggregates.totalBytesBefore).toBe(before.aggregates.totalBytesBefore);
    expect(after.aggregates.totalBytesAfter).toBe(before.aggregates.totalBytesAfter);
    expect(after.aggregates.totalHits).toBe(before.aggregates.totalHits);
    expect(after.recentEvents.length).toBe(before.recentEvents.length);
  });

  it("records bytesBefore, bytesAfter in aggregates", () => {
    const before = getRtkSummary();
    recordRtk(makeStats(1000, 400));
    const after = getRtkSummary();
    expect(after.aggregates.totalBytesBefore).toBe(before.aggregates.totalBytesBefore + 1000);
    expect(after.aggregates.totalBytesAfter).toBe(before.aggregates.totalBytesAfter + 400);
  });

  it("records hit count in totalHits", () => {
    const before = getRtkSummary();
    const hits = [makeHit("git-diff"), makeHit("grep")];
    recordRtk(makeStats(2000, 800, hits));
    const after = getRtkSummary();
    expect(after.aggregates.totalHits).toBe(before.aggregates.totalHits + 2);
  });

  it("records per-filter hit counts in hitsByFilter", () => {
    const before = getRtkSummary();
    const beforeCount = before.aggregates.hitsByFilter["tree"] ?? 0;
    recordRtk(makeStats(500, 200, [makeHit("tree"), makeHit("tree")]));
    const after = getRtkSummary();
    expect(after.aggregates.hitsByFilter["tree"]).toBe(beforeCount + 2);
  });

  it("stored event has correct ratio", () => {
    recordRtk(makeStats(1000, 500, []));
    const summary = getRtkSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.ratio).toBeCloseTo(0.5, 5);
  });

  it("stored event has a timestamp", () => {
    const before = Date.now();
    recordRtk(makeStats(1000, 600, []));
    const after = Date.now();
    const summary = getRtkSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });

  it("stored event carries hits from input", () => {
    const hits = [makeHit("git-diff", "openai-tool", 200)];
    recordRtk(makeStats(1000, 800, hits));
    const summary = getRtkSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.hits).toHaveLength(1);
    expect(event.hits[0].filter).toBe("git-diff");
  });

  it("ratio is 0 when bytesBefore is 0", () => {
    recordRtk(makeStats(0, 0, []));
    const summary = getRtkSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.ratio).toBe(0);
  });
});

describe("getRtkSummary", () => {
  it("returns required fields with numeric values >= 0", () => {
    const { aggregates } = getRtkSummary();
    expect(typeof aggregates.totalBytesBefore).toBe("number");
    expect(typeof aggregates.totalBytesAfter).toBe("number");
    expect(typeof aggregates.compressionPct).toBe("number");
    expect(typeof aggregates.totalHits).toBe("number");
    expect(typeof aggregates.hitsByFilter).toBe("object");
    expect(aggregates.totalBytesBefore).toBeGreaterThanOrEqual(0);
    expect(aggregates.totalBytesAfter).toBeGreaterThanOrEqual(0);
    expect(aggregates.compressionPct).toBeGreaterThanOrEqual(0);
    expect(aggregates.totalHits).toBeGreaterThanOrEqual(0);
  });

  it("compressionPct is calculated correctly", () => {
    // Record a known event and verify compressionPct formula
    const before = getRtkSummary().aggregates;
    const addBefore = 2000;
    const addAfter = 1000;
    recordRtk(makeStats(addBefore, addAfter, []));
    const after = getRtkSummary().aggregates;
    const expectedPct =
      ((1 - after.totalBytesAfter / after.totalBytesBefore) * 100);
    expect(after.compressionPct).toBeCloseTo(expectedPct, 1);
  });

  it("recentEvents is an array", () => {
    const { recentEvents } = getRtkSummary();
    expect(Array.isArray(recentEvents)).toBe(true);
  });
});

describe("getRtkTimeSeries", () => {
  it("returns an array", () => {
    expect(Array.isArray(getRtkTimeSeries())).toBe(true);
  });

  it("respects limit parameter", () => {
    // Record 5 extra events
    for (let i = 0; i < 5; i++) recordRtk(makeStats(100, 50, []));
    const series = getRtkTimeSeries(3);
    expect(series.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Caveman metrics
// ---------------------------------------------------------------------------

describe("recordCaveman", () => {
  it("increments totalRequests", () => {
    const before = getCavemanSummary();
    recordCaveman(makeCavemanInput());
    const after = getCavemanSummary();
    expect(after.aggregates.totalRequests).toBe(before.aggregates.totalRequests + 1);
  });

  it("increments countByLevel for the given level", () => {
    const before = getCavemanSummary();
    const beforeCount = before.aggregates.countByLevel["ultra"] ?? 0;
    recordCaveman(makeCavemanInput("ultra"));
    const after = getCavemanSummary();
    expect(after.aggregates.countByLevel["ultra"]).toBe(beforeCount + 1);
  });

  it("increments countByFormat for the given format", () => {
    const before = getCavemanSummary();
    const beforeCount = before.aggregates.countByFormat["claude"] ?? 0;
    recordCaveman(makeCavemanInput("lite", "claude-3-opus", 150, "claude"));
    const after = getCavemanSummary();
    expect(after.aggregates.countByFormat["claude"]).toBe(beforeCount + 1);
  });

  it("stored event carries level, model, outputTokens, format", () => {
    recordCaveman({ level: "wenyan-full", model: "gpt-4o-mini", outputTokens: 77, format: "openai" });
    const summary = getCavemanSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.level).toBe("wenyan-full");
    expect(event.model).toBe("gpt-4o-mini");
    expect(event.outputTokens).toBe(77);
    expect(event.format).toBe("openai");
  });

  it("stores null outputTokens without error", () => {
    recordCaveman({ level: "full", model: "gpt-4o", outputTokens: null, format: "openai" });
    const summary = getCavemanSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.outputTokens).toBeNull();
  });

  it("stored event has a timestamp", () => {
    const before = Date.now();
    recordCaveman(makeCavemanInput());
    const after = Date.now();
    const summary = getCavemanSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });

  it("defaults format to 'unknown' when not provided", () => {
    recordCaveman({ level: "lite", model: "gpt-4o", outputTokens: 100 });
    const summary = getCavemanSummary();
    const event = summary.recentEvents[summary.recentEvents.length - 1];
    expect(event.format).toBe("unknown");
  });
});

describe("getCavemanSummary", () => {
  it("returns required fields with numeric values >= 0", () => {
    const { aggregates } = getCavemanSummary();
    expect(typeof aggregates.totalRequests).toBe("number");
    expect(typeof aggregates.countByLevel).toBe("object");
    expect(typeof aggregates.countByFormat).toBe("object");
    expect(aggregates.totalRequests).toBeGreaterThanOrEqual(0);
  });

  it("recentEvents is an array", () => {
    expect(Array.isArray(getCavemanSummary().recentEvents)).toBe(true);
  });
});

describe("getCavemanTimeSeries", () => {
  it("returns an array", () => {
    expect(Array.isArray(getCavemanTimeSeries())).toBe(true);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) recordCaveman(makeCavemanInput());
    const series = getCavemanTimeSeries(2);
    expect(series.length).toBeLessThanOrEqual(2);
  });
});
