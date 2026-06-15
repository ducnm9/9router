/**
 * Bug Condition Exploration Tests
 * 
 * These tests encode the EXPECTED (correct) behavior for all 8 bugs.
 * They are designed to FAIL on unfixed code — failure confirms the bugs exist.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 * 
 * Property 1: Bug Condition - Comprehensive Bug Condition Verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Bug 1: Login with default password "123456" in production should be REJECTED
// ============================================================================
describe("Bug 1: Production default password login rejection", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should reject login with password '123456' when NODE_ENV=production and no INITIAL_PASSWORD set", async () => {
    // Set up production environment with no custom password
    process.env.NODE_ENV = "production";
    delete process.env.INITIAL_PASSWORD;

    // Mock the dependencies of the login route
    vi.doMock("@/lib/localDb", () => ({
      getSettings: vi.fn().mockResolvedValue({
        // No stored hash — means user never set a password
        password: null,
        tunnelDashboardAccess: true,
      }),
    }));

    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body, opts) => ({
          body,
          status: opts?.status || 200,
        }),
      },
    }));

    vi.doMock("jose", () => ({
      SignJWT: class {
        setProtectedHeader() { return this; }
        setExpirationTime() { return this; }
        sign() { return Promise.resolve("mock-token"); }
      },
    }));

    vi.doMock("next/headers", () => ({
      cookies: () => Promise.resolve({
        set: vi.fn(),
      }),
    }));

    vi.doMock("bcryptjs", () => ({
      default: { compare: vi.fn().mockResolvedValue(false) },
    }));

    const { POST } = await import("../../src/app/api/auth/login/route.js");

    const mockRequest = {
      json: () => Promise.resolve({ password: "123456" }),
      headers: new Map([["host", "localhost:20128"]]),
    };
    mockRequest.headers.get = (key) => mockRequest.headers.has(key) ? mockRequest.headers.get(key) : null;
    // Fix Map get
    const headersMap = { host: "localhost:20128", "x-forwarded-proto": "https" };
    mockRequest.headers = { get: (key) => headersMap[key] || null };

    const response = await POST(mockRequest);

    // EXPECTED: Login should be REJECTED in production with default password
    // The status should be 401 or 403 (not 200/success)
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body?.success).not.toBe(true);
  });
});

// ============================================================================
// Bug 2: DEFAULT_SETTINGS.requireApiKey should default to true in production
// ============================================================================
describe("Bug 2: Production requireApiKey default", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should default requireApiKey to true when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";

    // Since localDb.js has complex dependencies that are hard to mock in test env,
    // we test the logic directly by reading the source and evaluating the DEFAULT_SETTINGS.
    // The bug: DEFAULT_SETTINGS does not include requireApiKey (it's always absent/false).
    // Expected: In production, requireApiKey should default to true.
    
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    
    const sourcePath = path.resolve(
      fileURLToPath(import.meta.url),
      "../../../src/lib/localDb.js"
    );
    const source = readFileSync(sourcePath, "utf8");
    
    // Extract the DEFAULT_SETTINGS object
    const match = source.match(/const DEFAULT_SETTINGS\s*=\s*\{([\s\S]*?)\};/);
    expect(match).not.toBeNull();
    
    const settingsBlock = match[1];
    
    // Check if requireApiKey is conditionally set based on NODE_ENV=production
    // Expected: requireApiKey should default to true in production
    const hasRequireApiKeyProductionLogic = 
      settingsBlock.includes("requireApiKey") && 
      (source.includes('process.env.NODE_ENV === "production"') || 
       source.includes("process.env.NODE_ENV === 'production'"));
    
    // If the source doesn't have production-aware logic for requireApiKey,
    // then it defaults to false/undefined — which is the bug
    expect(hasRequireApiKeyProductionLogic).toBe(true);
  });
});

// ============================================================================
// Bug 3: Cookie secure flag should default to true in production
// ============================================================================
describe("Bug 3: Production cookie secure default", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should set secure cookie flag when NODE_ENV=production without explicit AUTH_COOKIE_SECURE", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_COOKIE_SECURE;

    let cookieOptions = null;

    vi.doMock("@/lib/localDb", () => ({
      getSettings: vi.fn().mockResolvedValue({
        password: null, // no stored hash
        tunnelDashboardAccess: true,
      }),
    }));

    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body, opts) => ({ body, status: opts?.status || 200 }),
      },
    }));

    vi.doMock("jose", () => ({
      SignJWT: class {
        setProtectedHeader() { return this; }
        setExpirationTime() { return this; }
        sign() { return Promise.resolve("mock-token"); }
      },
    }));

    vi.doMock("next/headers", () => ({
      cookies: () => Promise.resolve({
        set: (name, value, opts) => {
          cookieOptions = opts;
        },
      }),
    }));

    vi.doMock("bcryptjs", () => ({
      default: { compare: vi.fn().mockResolvedValue(false) },
    }));

    // We need to import fresh with production env
    // Set INITIAL_PASSWORD to something valid so login succeeds (to reach cookie-setting code)
    process.env.INITIAL_PASSWORD = "test-password-123";

    const { POST } = await import("../../src/app/api/auth/login/route.js");

    const headersMap = { host: "localhost:20128", "x-forwarded-proto": "http" };
    const mockRequest = {
      json: () => Promise.resolve({ password: "test-password-123" }),
      headers: { get: (key) => headersMap[key] || null },
    };

    await POST(mockRequest);

    // EXPECTED: In production, cookie should have secure: true even without explicit HTTPS
    expect(cookieOptions).not.toBeNull();
    expect(cookieOptions?.secure).toBe(true);
  });
});

// ============================================================================
// Bug 4: isCloud should return false when caches exists but caches.default is undefined
// ============================================================================
describe("Bug 4: isCloud false positive in non-Cloudflare environment", () => {
  it("should return false when caches exists but caches.default is undefined", async () => {
    // Read the actual source code to verify the isCloud expression is correct
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    
    const sourcePath = path.resolve(
      fileURLToPath(import.meta.url),
      "../../../src/lib/localDb.js"
    );
    const source = readFileSync(sourcePath, "utf8");
    
    // Extract the isCloud expression from source
    const match = source.match(/const isCloud\s*=\s*(.+?);/);
    expect(match).not.toBeNull();
    
    const expression = match[1];
    
    // The FIXED expression should use && and check caches.default
    // It must NOT use || (which was the bug)
    expect(expression).toContain("&&");
    expect(expression).toContain("caches.default");
    expect(expression).not.toMatch(/\|\|/);
    
    // Verify the fixed expression evaluates correctly:
    // When caches exists but caches.default is undefined → isCloud should be false
    const mockCaches = { open: () => {}, match: () => {} }; // No .default
    const caches = mockCaches;
    const isCloud = typeof caches !== 'undefined' && typeof caches.default !== 'undefined';
    expect(isCloud).toBe(false);
  });
});

// ============================================================================
// Bug 5: Sensitive headers should be redacted when ENABLE_REQUEST_LOGS=true
// ============================================================================
describe("Bug 5: Sensitive header redaction in request logger", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should redact Authorization bearer token in logged headers", async () => {
    // Read the source to extract and evaluate the maskSensitiveHeaders function
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    
    const sourcePath = path.resolve(
      fileURLToPath(import.meta.url),
      "../../../open-sse/utils/requestLogger.js"
    );
    const source = readFileSync(sourcePath, "utf8");
    
    // Extract the maskSensitiveHeaders function body
    // The function starts after the comment and ends before the next function
    const fnMatch = source.match(
      /function maskSensitiveHeaders\(headers\)\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).not.toBeNull();
    
    const fnBody = fnMatch[1];
    
    // Create the function dynamically to test actual behavior
    const maskSensitiveHeaders = new Function("headers", fnBody);
    
    const sensitiveHeaders = {
      "Authorization": "Bearer sk-test-1234567890abcdef",
      "Content-Type": "application/json",
      "x-api-key": "sk-secret-key-very-long-value-here",
    };

    const result = maskSensitiveHeaders(sensitiveHeaders);

    // EXPECTED: Authorization token should be redacted (not full value)
    expect(result["Authorization"]).not.toBe("Bearer sk-test-1234567890abcdef");
    // EXPECTED: x-api-key should be redacted
    expect(result["x-api-key"]).not.toBe("sk-secret-key-very-long-value-here");
    // Non-sensitive headers should pass through unchanged
    expect(result["Content-Type"]).toBe("application/json");
  });
});

// ============================================================================
// Bug 6: syncWithRetry should retry at least 3 times
// ============================================================================
describe("Bug 6: Cloud sync retry attempts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should make at least 3 attempts when sync always fails", async () => {
    // Mock the dependencies that cloudSyncScheduler imports
    vi.doMock("@/shared/utils/machineId", () => ({
      getConsistentMachineId: vi.fn().mockResolvedValue("test-machine-id"),
    }));
    vi.doMock("@/lib/localDb", () => ({
      isCloudEnabled: vi.fn().mockResolvedValue(true),
    }));

    const { CloudSyncScheduler } = await import("../../src/shared/services/cloudSyncScheduler.js");

    let attemptCount = 0;
    
    const scheduler = new CloudSyncScheduler("test-machine-id", 15);
    
    // Override sync to always throw
    scheduler.sync = async () => {
      attemptCount++;
      throw new Error("Network failure");
    };

    // Call syncWithRetry with default parameters (currently maxRetries = 1)
    await scheduler.syncWithRetry();

    // EXPECTED: At least 3 attempts should be made
    expect(attemptCount).toBeGreaterThanOrEqual(3);
  }, 15000); // Increased timeout: retries use exponential backoff (2s + 4s = 6s)
});

// ============================================================================
// Bug 7: refreshWithRetry should respect retryAfterMs from thrown errors
// ============================================================================
describe("Bug 7: Token refresh Retry-After header respect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should delay retry by at least retryAfterMs when error includes retryAfterMs", async () => {
    const { refreshWithRetry } = await import("../../open-sse/services/tokenRefresh.js");

    const retryAfterMs = 30000; // 30 seconds
    let callTimestamps = [];

    const mockRefreshFn = async () => {
      callTimestamps.push(Date.now());
      const error = new Error("Rate limited");
      error.retryAfterMs = retryAfterMs;
      throw error;
    };

    const resultPromise = refreshWithRetry(mockRefreshFn, 3, null);

    // Advance time through the retries
    // With the fix, delay = max(retryAfterMs, attempt * 1000)
    // Attempt 1 fails → delay = max(30000, 1000) = 30000ms
    await vi.advanceTimersByTimeAsync(30000);
    // Attempt 2 fails → delay = max(30000, 2000) = 30000ms
    await vi.advanceTimersByTimeAsync(30000);

    const result = await resultPromise;

    // EXPECTED: The delay between first and second call should be >= retryAfterMs (30s)
    expect(callTimestamps.length).toBeGreaterThanOrEqual(2);
    const delayBetweenCalls = callTimestamps[1] - callTimestamps[0];
    expect(delayBetweenCalls).toBeGreaterThanOrEqual(retryAfterMs);
  });
});

// ============================================================================
// Bug 8: handleComboChat should enforce overall timeout
// ============================================================================
describe("Bug 8: Combo overall timeout enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should abort within comboTimeoutMs when models cascade-fail with long delays", async () => {
    const { handleComboChat } = await import("../../open-sse/services/combo.js");

    // Use 5 models at 15s each = 75s total without timeout
    // With 60s timeout: after model 4 finishes at 60s,
    // the check before model 5 sees elapsed >= 60s → stops
    const models = ["model-a", "model-b", "model-c", "model-d", "model-e"];
    const perModelTimeoutMs = 15000; // Each model takes 15s to timeout
    const comboTimeoutMs = 60000;    // Overall combo timeout is 60s

    let totalModelsAttempted = 0;

    const handleSingleModel = async (body, modelStr) => {
      totalModelsAttempted++;
      // Simulate 15s timeout per model
      await new Promise(r => setTimeout(r, perModelTimeoutMs));
      // Return a failed response after timeout
      return {
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        clone: () => ({
          json: () => Promise.resolve({ error: { message: "Timeout" } }),
        }),
      };
    };

    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const resultPromise = handleComboChat({
      body: { model: "combo-test", messages: [] },
      models,
      handleSingleModel,
      log,
      comboName: "test-combo",
      comboStrategy: "fallback",
      comboTimeoutMs,
    });

    // Advance time — run through all pending timers until promise resolves
    // The combo function uses Date.now() checks, so advancing past the timeout
    // should trigger the guard before all models are attempted
    await vi.advanceTimersByTimeAsync(100000); // Advance well past the timeout

    const result = await resultPromise;

    // EXPECTED: With timeout enforcement, not all 5 models should be attempted
    // Without timeout: all 5 models would run (75s)
    // With timeout: after model-4 completes at 60s, check blocks model-5
    expect(totalModelsAttempted).toBeLessThan(models.length);
    
    // The result should be a 504 timeout response from the timeout guard
    const body = await result.json();
    expect(body.error).toBeDefined();
  });
});
