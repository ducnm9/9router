// Migration 003: add users and auditLog tables, add userId FK to apiKeys
export default {
  version: 3,
  name: "add-users-and-audit-log",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        oidcSub TEXT UNIQUE,
        avatarUrl TEXT,
        lastLoginAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        isActive INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS auditLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        userId TEXT REFERENCES users(id),
        action TEXT NOT NULL,
        resource TEXT,
        resourceId TEXT,
        details TEXT,
        ip TEXT,
        userAgent TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON auditLog(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_userId ON auditLog(userId);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON auditLog(action);
    `);

    // Add userId FK to apiKeys — safe for both fresh and existing DBs
    try {
      db.exec(`ALTER TABLE apiKeys ADD COLUMN userId TEXT REFERENCES users(id)`);
    } catch (e) {
      // Column already exists on fresh installs (schema.js TABLES defines it) — ignore
      if (!e.message?.includes("duplicate column")) throw e;
    }
  },
};
