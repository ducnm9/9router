import fs from "fs";
import path from "path";
import lockfile from "proper-lockfile";
import { DATA_DIR } from "@/lib/dataDir.js";

const QUOTA_FILE = path.join(DATA_DIR, "quota.json");
const LOCK_STALE_MS = 10000;

/**
 * Ensure the data directory exists (called before writes).
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Get the current billing period as "YYYY-MM"
 */
export function getCurrentPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Get the ISO date string of the next month's 1st (next reset date)
 */
export function getNextResetDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Next month's 1st at 00:00:00 UTC
  const next = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return next.toISOString();
}

/**
 * Read the quota.json file, auto-resetting if the period has changed.
 */
function readQuotaFile() {
  const currentPeriod = getCurrentPeriod();

  if (!fs.existsSync(QUOTA_FILE)) {
    return { period: currentPeriod, counters: {} };
  }

  try {
    const raw = fs.readFileSync(QUOTA_FILE, "utf-8");
    const data = JSON.parse(raw);

    // Auto-reset if period changed
    if (data.period !== currentPeriod) {
      return { period: currentPeriod, counters: {} };
    }

    return data;
  } catch {
    // Corrupt file — reset
    return { period: currentPeriod, counters: {} };
  }
}

/**
 * Write the quota data to disk
 */
function writeQuotaFile(data) {
  fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Get the counter for a specific key.
 * Returns zeroed counter if key is unknown or period has changed.
 */
export function getCounter(keyId) {
  const data = readQuotaFile();
  const counter = data.counters[keyId];

  if (!counter) {
    return { totalTokens: 0, totalCost: 0, lastUpdated: null };
  }

  return {
    totalTokens: counter.totalTokens ?? 0,
    totalCost: counter.totalCost ?? 0,
    lastUpdated: counter.lastUpdated ?? null,
  };
}

/**
 * Increment the counter for a key with file locking.
 * @param {string} keyId
 * @param {{ tokens?: number, cost?: number }} increments
 */
export async function incrementCounter(keyId, { tokens = 0, cost = 0 }) {
  // Ensure data directory and file exist before locking (atomic create)
  ensureDataDir();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify({ period: getCurrentPeriod(), counters: {} }, null, 2), { flag: "wx" });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    // File already exists, that's fine
  }

  let release;
  try {
    release = await lockfile.lock(QUOTA_FILE, { stale: LOCK_STALE_MS });

    const data = readQuotaFile();

    if (!data.counters[keyId]) {
      data.counters[keyId] = { totalTokens: 0, totalCost: 0, lastUpdated: null };
    }

    const counter = data.counters[keyId];
    counter.totalTokens += tokens;
    // Round cost to avoid floating point drift (10 decimal places)
    counter.totalCost = Math.round((counter.totalCost + cost) * 1e10) / 1e10;
    counter.lastUpdated = new Date().toISOString();

    writeQuotaFile(data);
  } finally {
    if (release) await release();
  }
}

/**
 * Reset the counter for a specific key with file locking.
 */
export async function resetCounter(keyId) {
  // Ensure data directory and file exist before locking (atomic create)
  ensureDataDir();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify({ period: getCurrentPeriod(), counters: {} }, null, 2), { flag: "wx" });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    // File already exists, that's fine
  }

  let release;
  try {
    release = await lockfile.lock(QUOTA_FILE, { stale: LOCK_STALE_MS });

    const data = readQuotaFile();
    data.counters[keyId] = { totalTokens: 0, totalCost: 0, lastUpdated: new Date().toISOString() };
    writeQuotaFile(data);
  } finally {
    if (release) await release();
  }
}

/**
 * Get all counters (full quota.json content).
 */
export function getAllCounters() {
  return readQuotaFile();
}

/**
 * Check if a counter is within quota limits.
 * @param {{ totalTokens: number, totalCost: number }} counter
 * @param {{ maxTokens?: number|null, maxCost?: number|null, warningThreshold?: number }|null} quota
 * @returns {{ allowed: boolean, warning: boolean, usage?: number, limit?: number, resetsAt?: string }}
 */
export function checkQuota(counter, quota) {
  // No quota configured → unlimited
  if (!quota) {
    return { allowed: true, warning: false };
  }

  const resetsAt = getNextResetDate();

  // Check if exceeded
  const tokensExceeded = quota.maxTokens != null && counter.totalTokens >= quota.maxTokens;
  const costExceeded = quota.maxCost != null && counter.totalCost >= quota.maxCost;

  if (tokensExceeded || costExceeded) {
    // Report the dimension that exceeded
    if (tokensExceeded) {
      return { allowed: false, warning: false, usage: counter.totalTokens, limit: quota.maxTokens, resetsAt };
    }
    return { allowed: false, warning: false, usage: counter.totalCost, limit: quota.maxCost, resetsAt };
  }

  // Check warning threshold
  const threshold = quota.warningThreshold ?? 0.8;
  let warning = false;

  if (quota.maxTokens != null && quota.maxTokens > 0) {
    const tokenRatio = counter.totalTokens / quota.maxTokens;
    if (tokenRatio >= threshold) warning = true;
  }

  if (quota.maxCost != null && quota.maxCost > 0) {
    const costRatio = counter.totalCost / quota.maxCost;
    if (costRatio >= threshold) warning = true;
  }

  if (warning) {
    // Report the highest ratio dimension
    let usage, limit;
    if (quota.maxTokens != null && quota.maxCost != null) {
      const tokenRatio = counter.totalTokens / quota.maxTokens;
      const costRatio = counter.totalCost / quota.maxCost;
      if (tokenRatio >= costRatio) {
        usage = counter.totalTokens;
        limit = quota.maxTokens;
      } else {
        usage = counter.totalCost;
        limit = quota.maxCost;
      }
    } else if (quota.maxTokens != null) {
      usage = counter.totalTokens;
      limit = quota.maxTokens;
    } else {
      usage = counter.totalCost;
      limit = quota.maxCost;
    }
    return { allowed: true, warning: true, usage, limit, resetsAt };
  }

  return { allowed: true, warning: false };
}
