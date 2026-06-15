# API Key Quota Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce per-API-key token and cost quotas with monthly reset, warning headers, and dashboard visibility.

**Architecture:** Dedicated `quotaDb.js` module manages a `quota.json` counter file (separate from usage tracking). Pre-request middleware checks quota before routing, post-request hook increments counters. Quota config lives in the existing `apiKeys[]` schema in `db.json`.

**Tech Stack:** LowDB (JSON file), proper-lockfile, Next.js App Router, existing usageTracking pipeline.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/quotaDb.js` (create) | Core quota logic: read/write quota.json, check quota, increment counter, reset |
| `src/app/api/keys/[id]/quota/route.js` (create) | GET quota status + PUT update quota config |
| `src/app/api/keys/[id]/quota/reset/route.js` (create) | POST manual counter reset |
| `src/app/api/usage/quota-summary/route.js` (create) | GET overview all keys quota status |
| `src/lib/localDb.js` (modify) | Extend apiKeys schema with `quota` field |
| `src/sse/handlers/chat.js` (modify) | Add quota check after API key validation |
| `open-sse/utils/usageTracking.js` (modify) | Hook post-request to increment quota counter |
| `tests/quotaDb.test.js` (create) | Unit tests for quota logic |
| `tests/quotaApi.test.js` (create) | Integration tests for quota API endpoints |

---

### Task 1: Create quotaDb.js Core Module

**Files:**
- Create: `src/lib/quotaDb.js`
- Create: `tests/quotaDb.test.js`

- [ ] **Step 1: Write failing tests for getCounter and period reset**

```javascript
// tests/quotaDb.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// Mock the data directory
const TEST_QUOTA_PATH = path.join(
  "/var/folders/pl/r6hjb3597jq36skmtjf7jlnw0000gn/T/opencode",
  "test-quota.json"
);

vi.mock("@/shared/utils/paths", () => ({
  getDataDir: () =>
    "/var/folders/pl/r6hjb3597jq36skmtjf7jlnw0000gn/T/opencode",
}));

describe("quotaDb", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_QUOTA_PATH)) fs.unlinkSync(TEST_QUOTA_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_QUOTA_PATH)) fs.unlinkSync(TEST_QUOTA_PATH);
    vi.restoreAllMocks();
  });

  describe("getCounter", () => {
    it("returns zero counter for unknown key", async () => {
      const { getCounter } = await import("@/lib/quotaDb");
      const counter = await getCounter("key_unknown");
      expect(counter).toEqual({
        totalTokens: 0,
        totalCost: 0,
        lastUpdated: expect.any(String),
      });
    });

    it("returns existing counter for known key", async () => {
      fs.writeFileSync(
        TEST_QUOTA_PATH,
        JSON.stringify({
          period: new Date().toISOString().slice(0, 7),
          counters: {
            key_abc: {
              totalTokens: 5000,
              totalCost: 1.5,
              lastUpdated: "2025-07-10T00:00:00Z",
            },
          },
        })
      );
      const { getCounter } = await import("@/lib/quotaDb");
      const counter = await getCounter("key_abc");
      expect(counter.totalTokens).toBe(5000);
      expect(counter.totalCost).toBe(1.5);
    });

    it("resets counters when period changes (new month)", async () => {
      fs.writeFileSync(
        TEST_QUOTA_PATH,
        JSON.stringify({
          period: "2024-01",
          counters: {
            key_abc: {
              totalTokens: 999999,
              totalCost: 99.99,
              lastUpdated: "2024-01-30T00:00:00Z",
            },
          },
        })
      );
      const { getCounter } = await import("@/lib/quotaDb");
      const counter = await getCounter("key_abc");
      expect(counter.totalTokens).toBe(0);
      expect(counter.totalCost).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/quotaDb.test.js`
Expected: FAIL — module `@/lib/quotaDb` does not exist

- [ ] **Step 3: Implement quotaDb.js — getCounter, period reset, file I/O**

```javascript
// src/lib/quotaDb.js
import fs from "fs";
import path from "path";
import { lock, unlock } from "proper-lockfile";

const DATA_DIR = process.env.NROUTER_DATA_DIR || path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".9router"
);
const QUOTA_FILE = path.join(DATA_DIR, "quota.json");
const LOCK_OPTIONS = { retries: { retries: 5, minTimeout: 50, maxTimeout: 200 } };

function getCurrentPeriod() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function getNextResetDate() {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  return new Date(year, month, 1).toISOString();
}

function emptyCounter() {
  return { totalTokens: 0, totalCost: 0, lastUpdated: new Date().toISOString() };
}

function readQuotaFile() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      return { period: getCurrentPeriod(), counters: {} };
    }
    const raw = fs.readFileSync(QUOTA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { period: getCurrentPeriod(), counters: {} };
  }
}

function writeQuotaFile(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function ensureCurrentPeriod(data) {
  const currentPeriod = getCurrentPeriod();
  if (data.period !== currentPeriod) {
    data.period = currentPeriod;
    data.counters = {};
  }
  return data;
}

export async function getCounter(keyId) {
  const data = ensureCurrentPeriod(readQuotaFile());
  return data.counters[keyId] || emptyCounter();
}

export async function incrementCounter(keyId, { tokens, cost }) {
  let release;
  try {
    if (!fs.existsSync(QUOTA_FILE)) writeQuotaFile({ period: getCurrentPeriod(), counters: {} });
    release = await lock(QUOTA_FILE, LOCK_OPTIONS);
    const data = ensureCurrentPeriod(readQuotaFile());
    if (!data.counters[keyId]) {
      data.counters[keyId] = emptyCounter();
    }
    data.counters[keyId].totalTokens += tokens;
    data.counters[keyId].totalCost += Math.round(cost * 1000000) / 1000000; // avoid float drift
    data.counters[keyId].lastUpdated = new Date().toISOString();
    writeQuotaFile(data);
  } finally {
    if (release) await release();
  }
}

export async function resetCounter(keyId) {
  let release;
  try {
    if (!fs.existsSync(QUOTA_FILE)) return;
    release = await lock(QUOTA_FILE, LOCK_OPTIONS);
    const data = readQuotaFile();
    if (data.counters[keyId]) {
      data.counters[keyId] = emptyCounter();
    }
    writeQuotaFile(data);
  } finally {
    if (release) await release();
  }
}

export async function getAllCounters() {
  const data = ensureCurrentPeriod(readQuotaFile());
  return data;
}

export function checkQuota(counter, quota) {
  if (!quota) return { allowed: true, warning: false };

  const { maxTokens, maxCost, warningThreshold = 0.8 } = quota;

  // Check if exceeded
  const tokensExceeded = maxTokens != null && counter.totalTokens >= maxTokens;
  const costExceeded = maxCost != null && counter.totalCost >= maxCost;

  if (tokensExceeded || costExceeded) {
    return {
      allowed: false,
      warning: false,
      usage: { totalTokens: counter.totalTokens, totalCost: counter.totalCost },
      limit: { maxTokens, maxCost },
      resetsAt: getNextResetDate(),
    };
  }

  // Check if warning threshold reached
  const tokensWarning = maxTokens != null && counter.totalTokens / maxTokens >= warningThreshold;
  const costWarning = maxCost != null && counter.totalCost / maxCost >= warningThreshold;

  return {
    allowed: true,
    warning: tokensWarning || costWarning,
    usage: { totalTokens: counter.totalTokens, totalCost: counter.totalCost },
    limit: { maxTokens, maxCost },
    resetsAt: getNextResetDate(),
  };
}

export { getCurrentPeriod, getNextResetDate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/quotaDb.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Write additional tests for incrementCounter and checkQuota**

```javascript
// Append to tests/quotaDb.test.js

describe("incrementCounter", () => {
  it("increments token and cost for a key", async () => {
    const { incrementCounter, getCounter } = await import("@/lib/quotaDb");
    await incrementCounter("key_inc", { tokens: 1000, cost: 0.5 });
    await incrementCounter("key_inc", { tokens: 2000, cost: 0.3 });
    const counter = await getCounter("key_inc");
    expect(counter.totalTokens).toBe(3000);
    expect(counter.totalCost).toBeCloseTo(0.8);
  });
});

describe("checkQuota", () => {
  it("returns allowed=true when under limit", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 500000, totalCost: 2.0 },
      { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("returns warning=true when at 80% tokens", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 800000, totalCost: 2.0 },
      { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("returns warning=true when at 80% cost", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 100000, totalCost: 4.0 },
      { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("returns allowed=false when tokens exceeded", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 1000001, totalCost: 2.0 },
      { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(false);
  });

  it("returns allowed=false when cost exceeded", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 500000, totalCost: 5.01 },
      { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(false);
  });

  it("returns allowed=true when quota is null (unlimited)", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 999999999, totalCost: 999.99 },
      null
    );
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("ignores null maxTokens (only checks cost)", () => {
    const { checkQuota } = require("@/lib/quotaDb");
    const result = checkQuota(
      { totalTokens: 999999999, totalCost: 4.5 },
      { maxTokens: null, maxCost: 5.0, warningThreshold: 0.8 }
    );
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true); // cost at 90%
  });
});
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run tests/quotaDb.test.js`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/quotaDb.js tests/quotaDb.test.js
git commit -m "feat(quota): add quotaDb core module with check, increment, reset"
```

---

### Task 2: Extend apiKeys Schema in localDb

**Files:**
- Modify: `src/lib/localDb.js` (lines 642-662 — createApiKey, and lines 680 — updateApiKey)

- [ ] **Step 1: Write failing test for quota field in API key**

```javascript
// tests/quotaDb.test.js — append new describe block

describe("localDb quota integration", () => {
  it("createApiKey stores quota field when provided", async () => {
    const { createApiKey, getApiKeyById } = await import("@/lib/localDb");
    const key = await createApiKey("test-key", "machine123");
    // New keys should not have quota by default
    expect(key.quota).toBeUndefined();
  });

  it("updateApiKey can set quota", async () => {
    const { createApiKey, updateApiKey, getApiKeyById } = await import("@/lib/localDb");
    const key = await createApiKey("quota-key", "machine123");
    await updateApiKey(key.id, {
      quota: { maxTokens: 1000000, maxCost: 5.0, warningThreshold: 0.8 }
    });
    const updated = await getApiKeyById(key.id);
    expect(updated.quota.maxTokens).toBe(1000000);
    expect(updated.quota.maxCost).toBe(5.0);
    expect(updated.quota.warningThreshold).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx vitest run tests/quotaDb.test.js -t "localDb quota"`
Expected: Should PASS already since `updateApiKey` does a spread merge — this verifies existing behavior supports quota without code changes.

- [ ] **Step 3: Add getApiKeyByValue helper to localDb.js**

The quota check needs to look up key config by the key string (not by ID). Add this function near line 689 (after `validateApiKey`):

```javascript
// src/lib/localDb.js — add after validateApiKey function

export async function getApiKeyByValue(keyValue) {
  const db = await getDb();
  await safeRead(db);
  const keys = db.data.apiKeys || [];
  return keys.find((k) => k.key === keyValue && k.isActive !== false) || null;
}
```

- [ ] **Step 4: Run existing tests to ensure nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/localDb.js tests/quotaDb.test.js
git commit -m "feat(quota): add getApiKeyByValue helper, verify quota field support"
```

---

### Task 3: Integrate Quota Check into handleChat

**Files:**
- Modify: `src/sse/handlers/chat.js` (after auth check, around line 80)

- [ ] **Step 1: Write the quota check integration code**

Insert after the existing API key validation block (after line 80 in `src/sse/handlers/chat.js`):

```javascript
// Add import at top of file
import { getCounter, checkQuota } from "@/lib/quotaDb";
import { getApiKeyByValue } from "@/lib/localDb";

// Insert AFTER the existing auth check block (after line ~80):
// --- Quota Check ---
if (apiKey) {
  const keyConfig = await getApiKeyByValue(apiKey);
  if (keyConfig?.quota) {
    const counter = await getCounter(keyConfig.id);
    const quotaResult = checkQuota(counter, keyConfig.quota);

    if (!quotaResult.allowed) {
      const tokensDisplay = quotaResult.limit.maxTokens
        ? `${quotaResult.usage.totalTokens.toLocaleString()}/${quotaResult.limit.maxTokens.toLocaleString()}`
        : "N/A";
      return new Response(
        JSON.stringify({
          error: {
            type: "quota_exceeded",
            message: `API key quota exceeded. Token usage: ${tokensDisplay}. Resets on ${new Date(quotaResult.resetsAt).toISOString().slice(0, 10)}.`,
            code: "quota_exceeded",
            quota: {
              tokens: {
                used: quotaResult.usage.totalTokens,
                limit: quotaResult.limit.maxTokens,
              },
              cost: {
                used: quotaResult.usage.totalCost,
                limit: quotaResult.limit.maxCost,
              },
              resetsAt: quotaResult.resetsAt,
            },
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Attach warning info to request context for post-response headers
    if (quotaResult.warning) {
      // Store on a variable accessible to response handler
      request.__quotaWarning = {
        tokensUsed: quotaResult.usage.totalTokens,
        tokensLimit: quotaResult.limit.maxTokens,
        costUsed: quotaResult.usage.totalCost,
        costLimit: quotaResult.limit.maxCost,
        resetsAt: quotaResult.resetsAt,
      };
    }

    // Store keyId for post-request increment
    request.__quotaKeyId = keyConfig.id;
  }
}
```

- [ ] **Step 2: Verify the file still parses correctly**

Run: `node -c src/sse/handlers/chat.js`
Expected: No syntax errors

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/sse/handlers/chat.js
git commit -m "feat(quota): add pre-request quota check in handleChat"
```

---

### Task 4: Hook Post-Request Usage into Quota Counter

**Files:**
- Modify: `open-sse/utils/usageTracking.js` (in `logUsage` function, around line 296-337)

- [ ] **Step 1: Add quota increment call to logUsage**

In `open-sse/utils/usageTracking.js`, find the `logUsage` function and add the quota increment after `saveRequestUsage`:

```javascript
// Add import at top of file
import { incrementCounter } from "../../src/lib/quotaDb.js";
import { calculateCost } from "../../src/lib/usageDb.js";

// Inside logUsage(), after the saveRequestUsage call:
// --- Quota counter increment ---
if (apiKey) {
  try {
    // We need the keyId, but logUsage receives apiKey value
    // Use dynamic import to avoid circular deps if needed
    const { getApiKeyByValue } = await import("../../src/lib/localDb.js");
    const keyConfig = await getApiKeyByValue(apiKey);
    if (keyConfig?.quota) {
      const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
      const cost = calculateCost(provider, model, usage);
      await incrementCounter(keyConfig.id, { tokens: totalTokens, cost: cost || 0 });
    }
  } catch (e) {
    // Don't let quota tracking failure break the request
    console.error("[Quota] Failed to increment counter:", e.message);
  }
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c open-sse/utils/usageTracking.js`
Expected: No syntax errors

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add open-sse/utils/usageTracking.js
git commit -m "feat(quota): hook post-request usage into quota counter increment"
```

---

### Task 5: Quota API Endpoints

**Files:**
- Create: `src/app/api/keys/[id]/quota/route.js`
- Create: `src/app/api/keys/[id]/quota/reset/route.js`
- Create: `src/app/api/usage/quota-summary/route.js`

- [ ] **Step 1: Create GET/PUT /api/keys/[id]/quota**

```javascript
// src/app/api/keys/[id]/quota/route.js
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
```

- [ ] **Step 2: Create POST /api/keys/[id]/quota/reset**

```javascript
// src/app/api/keys/[id]/quota/reset/route.js
import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { resetCounter } from "@/lib/quotaDb";

export async function POST(request, { params }) {
  const { id } = await params;
  const keyConfig = await getApiKeyById(id);

  if (!keyConfig) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await resetCounter(id);

  return NextResponse.json({ keyId: id, message: "Quota counter reset successfully" });
}
```

- [ ] **Step 3: Create GET /api/usage/quota-summary**

```javascript
// src/app/api/usage/quota-summary/route.js
import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getAllCounters, getCurrentPeriod, getNextResetDate } from "@/lib/quotaDb";

export async function GET() {
  const apiKeys = await getApiKeys();
  const { counters } = await getAllCounters();

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
      let status = "ok";
      if (maxPercent >= 100) status = "exceeded";
      else if (maxPercent >= (quota.warningThreshold || 0.8) * 100) status = "warning";

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
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node -c src/app/api/keys/\\[id\\]/quota/route.js && node -c src/app/api/keys/\\[id\\]/quota/reset/route.js && node -c src/app/api/usage/quota-summary/route.js`
Expected: No syntax errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/keys/\[id\]/quota/ src/app/api/usage/quota-summary/
git commit -m "feat(quota): add quota management API endpoints"
```

---

### Task 6: Integration Test for Quota Flow

**Files:**
- Create: `tests/quotaApi.test.js`

- [ ] **Step 1: Write integration tests**

```javascript
// tests/quotaApi.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkQuota, getCounter, incrementCounter, resetCounter } from "@/lib/quotaDb";

describe("Quota enforcement flow", () => {
  beforeEach(async () => {
    // Reset the test key counter
    await resetCounter("key_test_flow");
  });

  it("allows request when under quota", async () => {
    const counter = await getCounter("key_test_flow");
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("shows warning after threshold crossed", async () => {
    await incrementCounter("key_test_flow", { tokens: 850000, cost: 4.2 });
    const counter = await getCounter("key_test_flow");
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("blocks request after quota exceeded", async () => {
    await incrementCounter("key_test_flow", { tokens: 1000001, cost: 3.0 });
    const counter = await getCounter("key_test_flow");
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(false);
  });

  it("resets counter and allows again", async () => {
    await incrementCounter("key_test_flow", { tokens: 1000001, cost: 6.0 });
    await resetCounter("key_test_flow");
    const counter = await getCounter("key_test_flow");
    const result = checkQuota(counter, {
      maxTokens: 1000000,
      maxCost: 5.0,
      warningThreshold: 0.8,
    });
    expect(result.allowed).toBe(true);
    expect(counter.totalTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/quotaApi.test.js`
Expected: PASS (4 tests)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/quotaApi.test.js
git commit -m "test(quota): add integration tests for quota enforcement flow"
```

---

### Task 7: Warning Headers in SSE Response

**Files:**
- Modify: `src/sse/handlers/chat.js` (response construction area)

- [ ] **Step 1: Add warning headers to non-streaming responses**

Find where the response is returned in `handleChat` for non-streaming responses and add quota warning headers. In SSE streaming responses, include a final event with quota info.

For non-streaming (non-SSE) responses, add headers before returning:

```javascript
// In the response path, check for __quotaWarning
function buildQuotaHeaders(request) {
  const warning = request.__quotaWarning;
  if (!warning) return {};
  return {
    "X-Quota-Warning": "true",
    "X-Quota-Tokens-Used": String(warning.tokensUsed),
    "X-Quota-Tokens-Limit": String(warning.tokensLimit || "unlimited"),
    "X-Quota-Cost-Used": String(warning.costUsed),
    "X-Quota-Cost-Limit": String(warning.costLimit || "unlimited"),
    "X-Quota-Reset": warning.resetsAt,
  };
}
```

For SSE streaming responses, append the headers to the initial response headers since SSE responses can include custom headers at the start:

```javascript
// When constructing the SSE Response object, spread quota headers:
const headers = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  ...buildQuotaHeaders(request),
};
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c src/sse/handlers/chat.js`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add src/sse/handlers/chat.js
git commit -m "feat(quota): add warning headers to responses when near quota limit"
```

---

### Task 8: Dashboard UI — Quota Display on API Keys Page

**Files:**
- Modify: The API Keys page component (likely under `src/app/(dashboard)/keys/` or similar)
- This task requires identifying the exact dashboard page file first.

- [ ] **Step 1: Identify the API keys dashboard page**

Run: `find src/app -name "*.jsx" -o -name "*.tsx" | grep -i key`

Look for the page that renders the API keys list.

- [ ] **Step 2: Add quota progress bar component**

Create a small inline component or add to existing key list item:

```jsx
function QuotaBar({ percentage, status }) {
  const color =
    status === "exceeded"
      ? "bg-red-500"
      : status === "warning"
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Fetch quota data and display in key list**

Add a `useSWR` or `useEffect` fetch to `/api/usage/quota-summary` and render quota info per key:

```jsx
// In the key list item, below the key name:
{key.quota && (
  <div className="mt-2 space-y-1">
    <div className="flex justify-between text-xs text-gray-500">
      <span>Tokens: {quotaData?.percentage?.tokens || 0}%</span>
      <span>Cost: {quotaData?.percentage?.cost || 0}%</span>
    </div>
    <QuotaBar
      percentage={Math.max(quotaData?.percentage?.tokens || 0, quotaData?.percentage?.cost || 0)}
      status={quotaData?.status || "ok"}
    />
  </div>
)}
```

- [ ] **Step 4: Add quota edit form to key creation/edit modal**

Add fields to the existing key form:

```jsx
<div className="space-y-2">
  <label className="text-sm font-medium">Monthly Token Limit</label>
  <input
    type="number"
    placeholder="e.g. 1000000 (null = unlimited)"
    value={quota.maxTokens || ""}
    onChange={(e) => setQuota({ ...quota, maxTokens: e.target.value ? parseInt(e.target.value) : null })}
    className="w-full px-3 py-2 border rounded-md"
  />
  <label className="text-sm font-medium">Monthly Cost Limit (USD)</label>
  <input
    type="number"
    step="0.01"
    placeholder="e.g. 5.00 (null = unlimited)"
    value={quota.maxCost || ""}
    onChange={(e) => setQuota({ ...quota, maxCost: e.target.value ? parseFloat(e.target.value) : null })}
    className="w-full px-3 py-2 border rounded-md"
  />
  <label className="text-sm font-medium">Warning Threshold</label>
  <input
    type="number"
    step="0.05"
    min="0.1"
    max="0.99"
    placeholder="0.8"
    value={quota.warningThreshold || 0.8}
    onChange={(e) => setQuota({ ...quota, warningThreshold: parseFloat(e.target.value) })}
    className="w-full px-3 py-2 border rounded-md"
  />
</div>
```

- [ ] **Step 5: Add manual reset button**

```jsx
<button
  onClick={async () => {
    await fetch(`/api/keys/${key.id}/quota/reset`, { method: "POST" });
    mutate(); // refresh SWR
  }}
  className="text-xs text-blue-600 hover:underline"
>
  Reset Quota
</button>
```

- [ ] **Step 6: Test dashboard manually**

Run: `npm run dev`
Verify: Navigate to API keys page, create a key with quota, verify progress bar shows.

- [ ] **Step 7: Commit**

```bash
git add src/app/
git commit -m "feat(quota): add quota display and management to dashboard UI"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npx vitest run` — all tests pass
- [ ] `npm run build` — no build errors
- [ ] Manual test: create key with quota, make requests, verify counter increments
- [ ] Manual test: exceed quota, verify 429 response with correct body
- [ ] Manual test: verify warning headers appear at 80% threshold
- [ ] Manual test: reset counter via API, verify requests work again
- [ ] Manual test: verify new month auto-resets (set system clock or mock date)
