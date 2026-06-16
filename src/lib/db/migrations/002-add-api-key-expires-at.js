// Migration 002: add expiresAt column to apiKeys
export default {
  version: 2,
  name: "add-api-key-expires-at",
  up(db) {
    db.exec(`ALTER TABLE apiKeys ADD COLUMN expiresAt TEXT DEFAULT NULL`);
  },
};
