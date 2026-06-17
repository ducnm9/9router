// src/lib/db/repos/templateRepo.js
import { getAdapter } from '../driver.js';
import { randomUUID } from 'crypto';

const SCOPE = 'templates';

export async function getTemplates({ category } = {}) {
  const db = await getAdapter();
  const rows = db.all('SELECT * FROM kv WHERE scope = ?', [SCOPE]);
  let templates = rows.flatMap(r => {
    try { return [{ id: r.key, ...JSON.parse(r.value) }]; }
    catch { return []; }
  });
  if (category) templates = templates.filter(t => t.category === category);
  return templates.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getTemplateById(id) {
  if (!id) return undefined;
  const db = await getAdapter();
  const row = db.get('SELECT * FROM kv WHERE scope = ? AND key = ?', [SCOPE, id]);
  if (!row) return undefined;
  try { return { id: row.key, ...JSON.parse(row.value) }; }
  catch { return undefined; }
}

export async function createTemplate({ name, content, category = 'general', variables = [] } = {}) {
  if (!name) throw new Error('createTemplate: name is required');
  if (!content) throw new Error('createTemplate: content is required');
  const db = await getAdapter();
  const id = randomUUID();
  const now = new Date().toISOString();
  const data = { name, content, category, variables, createdAt: now, updatedAt: now };
  db.run('INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)', [SCOPE, id, JSON.stringify(data)]);
  return { id, ...data };
}

export async function updateTemplate(id, updates = {}) {
  const existing = await getTemplateById(id);
  if (!existing) return null;
  const { id: _, ...rest } = existing;
  const updated = { ...rest, ...updates, updatedAt: new Date().toISOString() };
  const db = await getAdapter();
  db.run('UPDATE kv SET value = ? WHERE scope = ? AND key = ?', [JSON.stringify(updated), SCOPE, id]);
  return { id, ...updated };
}

export async function deleteTemplate(id) {
  const db = await getAdapter();
  db.run('DELETE FROM kv WHERE scope = ? AND key = ?', [SCOPE, id]);
}
