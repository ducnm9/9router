// src/lib/db/repos/auditRepo.js
import { getAdapter } from '../driver.js';

/**
 * Log an audit event (fire-and-forget safe — never throws to caller).
 */
export async function logAuditEvent({ userId, action, resource, resourceId, details, ip, userAgent } = {}) {
  if (!action) return; // action is the required minimum
  try {
    const db = await getAdapter();
    db.run(
      `INSERT INTO auditLog (userId, action, resource, resourceId, details, ip, userAgent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        action,
        resource || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ip || null,
        userAgent || null,
      ]
    );
  } catch (err) {
    // Audit failures must never break the request
    console.warn('[auditRepo] Failed to log event:', err.message);
  }
}

/**
 * Query audit logs with optional filters.
 */
export async function getAuditLogs({ action, resource, userId, limit = 50, offset = 0, from, to } = {}) {
  const db = await getAdapter();
  let sql = 'SELECT * FROM auditLog WHERE 1=1';
  const params = [];

  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (resource) { sql += ' AND resource = ?'; params.push(resource); }
  if (userId) { sql += ' AND userId = ?'; params.push(userId); }
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.all(sql, params);
  return rows.map(row => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
  }));
}

/**
 * Get audit logs for a specific user.
 */
export async function getAuditLogsByUser(userId, { limit = 50, offset = 0 } = {}) {
  return getAuditLogs({ userId, limit, offset });
}

/**
 * Get aggregated stats grouped by action.
 */
export async function getAuditStats({ from, to } = {}) {
  const db = await getAdapter();
  let sql = 'SELECT action, COUNT(*) as count FROM auditLog WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
  sql += ' GROUP BY action ORDER BY count DESC';
  return db.all(sql, params);
}
