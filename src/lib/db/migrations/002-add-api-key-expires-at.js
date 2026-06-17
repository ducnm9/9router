// Migration 002: add expiresAt column to apiKeys
export default {
  version: 2,
  name: "add-api-key-expires-at",
  up(db) {
    // Guard: migration 001 creates tables from the current TABLES schema which
    // already includes expiresAt, so on fresh DBs the column is already present.
    const cols = db.all(`PRAGMA table_info(apiKeys)`).map((r) => r.name);
    if (!cols.includes("expiresAt")) {
      db.exec(`ALTER TABLE apiKeys ADD COLUMN expiresAt TEXT DEFAULT NULL`);
    }
  },
};
