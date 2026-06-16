import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  let quota = null;
  if (row.quota) {
    try { quota = typeof row.quota === "string" ? JSON.parse(row.quota) : row.quota; } catch { /* ignore */ }
  }
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    quota,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, { expiresAt = null } = {}) {
  if (!machineId) throw new Error("machineId is required");
  // Validate expiresAt if provided
  if (expiresAt != null) {
    const d = new Date(expiresAt);
    if (isNaN(d.getTime())) {
      throw new Error('Invalid expiresAt date format. Use ISO 8601.');
    }
  }
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    expiresAt: expiresAt ?? null,
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, expiresAt, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.expiresAt, apiKey.createdAt]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  // Validate expiresAt if provided
  if (data.expiresAt != null) {
    const d = new Date(data.expiresAt);
    if (isNaN(d.getTime())) {
      throw new Error('Invalid expiresAt date format. Use ISO 8601.');
    }
  }
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const current = rowToKey(row);
    const merged = { ...current, ...data };
    const quotaStr = merged.quota ? JSON.stringify(merged.quota) : null;
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, quota = ?, expiresAt = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, quotaStr, merged.expiresAt ?? null, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}

export async function getApiKeyByValue(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export function isKeyExpired(key) {
  if (!key.expiresAt) return false;
  const d = new Date(key.expiresAt);
  if (isNaN(d.getTime())) return false; // malformed date = treat as no expiry
  return d <= new Date();
}

export function getExpirationStatus(key) {
  if (!key.expiresAt) {
    return { expired: false, warning: false, daysRemaining: null, expiresAt: null };
  }
  const expires = new Date(key.expiresAt);
  if (isNaN(expires.getTime())) {
    return { expired: false, warning: false, daysRemaining: null, expiresAt: key.expiresAt, malformed: true };
  }
  const now = new Date();
  const msRemaining = expires - now;
  const daysRemaining = Math.floor(msRemaining / 86400000);
  return {
    expired: msRemaining <= 0,
    warning: daysRemaining <= 7 && daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
    expiresAt: key.expiresAt,
  };
}
