// tests/unit/templateRepo.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '9router-templaterepo-'));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe('Template Repository', () => {
  let createTemplate, getTemplates, getTemplateById, updateTemplate, deleteTemplate;

  beforeEach(async () => {
    const mod = await import('@/lib/db/repos/templateRepo.js');
    createTemplate = mod.createTemplate;
    getTemplates = mod.getTemplates;
    getTemplateById = mod.getTemplateById;
    updateTemplate = mod.updateTemplate;
    deleteTemplate = mod.deleteTemplate;
  });

  it('creates a template and retrieves by id', async () => {
    const t = await createTemplate({ name: 'Code Review', content: 'Review this code: {{code}}', category: 'coding' });
    expect(t.id).toBeDefined();
    expect(t.name).toBe('Code Review');
    expect(t.content).toContain('{{code}}');
    const found = await getTemplateById(t.id);
    expect(found.name).toBe('Code Review');
  });

  it('lists all templates', async () => {
    await createTemplate({ name: 'Template A', content: 'Content A', category: 'misc' });
    await createTemplate({ name: 'Template B', content: 'Content B', category: 'misc' });
    const all = await getTemplates();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by category', async () => {
    await createTemplate({ name: 'Code Template', content: 'Fix: {{issue}}', category: 'coding' });
    await createTemplate({ name: 'Email Template', content: 'Write email about {{topic}}', category: 'writing' });
    const coding = await getTemplates({ category: 'coding' });
    expect(coding.every(t => t.category === 'coding')).toBe(true);
  });

  it('updates a template', async () => {
    const t = await createTemplate({ name: 'Old Name', content: 'old content', category: 'misc' });
    const updated = await updateTemplate(t.id, { name: 'New Name', content: 'new content' });
    expect(updated.name).toBe('New Name');
    expect(updated.content).toBe('new content');
  });

  it('deletes a template', async () => {
    const t = await createTemplate({ name: 'Delete Me', content: 'x', category: 'misc' });
    await deleteTemplate(t.id);
    const found = await getTemplateById(t.id);
    expect(found).toBeUndefined();
  });

  it('requires name and content', async () => {
    await expect(createTemplate({ category: 'misc' })).rejects.toThrow();
  });

  it('getTemplateById returns undefined for missing id', async () => {
    const found = await getTemplateById('nonexistent-id');
    expect(found).toBeUndefined();
  });
});
