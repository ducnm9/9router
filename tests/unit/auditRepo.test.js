import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Audit Repository', () => {
  let logAuditEvent, getAuditLogs, getAuditLogsByUser, getAuditStats;
  let createUser;
  let tempDir;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '9router-audit-test-'));
    process.env.DATA_DIR = tempDir;
    delete global._dbAdapter;

    const mod = await import('@/lib/db/repos/auditRepo.js');
    logAuditEvent = mod.logAuditEvent;
    getAuditLogs = mod.getAuditLogs;
    getAuditLogsByUser = mod.getAuditLogsByUser;
    getAuditStats = mod.getAuditStats;

    const userMod = await import('@/lib/db/repos/userRepo.js');
    createUser = userMod.createUser;
  });

  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('logs an event and retrieves it', async () => {
    // Create user first to satisfy FK constraint
    const user = await createUser({ email: 'u1@test.com', name: 'User 1' });
    await logAuditEvent({
      userId: user.id,
      action: 'key.created',
      resource: 'apiKey',
      resourceId: 'key-123',
      details: { name: 'test-key' },
      ip: '127.0.0.1'
    });

    const logs = await getAuditLogs({ limit: 10 });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('key.created');
    expect(logs[0].userId).toBe(user.id);
    expect(logs[0].details).toEqual({ name: 'test-key' });
  });

  it('filters by user', async () => {
    const u2 = await createUser({ email: 'u2@test.com', name: 'User 2' });
    const u3 = await createUser({ email: 'u3@test.com', name: 'User 3' });
    await logAuditEvent({ userId: u2.id, action: 'settings.updated', resource: 'settings' });
    await logAuditEvent({ userId: u3.id, action: 'key.deleted', resource: 'apiKey' });
    const logs = await getAuditLogsByUser(u2.id, { limit: 10 });
    expect(logs.every(l => l.userId === u2.id)).toBe(true);
  });

  it('filters by action type', async () => {
    await logAuditEvent({ action: 'key.created', resource: 'apiKey' });
    await logAuditEvent({ action: 'settings.updated', resource: 'settings' });
    const logs = await getAuditLogs({ action: 'key.created', limit: 100 });
    expect(logs.every(l => l.action === 'key.created')).toBe(true);
  });

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await logAuditEvent({ action: `action.${i}`, resource: 'test' });
    }
    const page1 = await getAuditLogs({ userId: null, limit: 2, offset: 0 });
    const page2 = await getAuditLogs({ userId: null, limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('returns stats grouped by action', async () => {
    await logAuditEvent({ action: 'key.created' });
    await logAuditEvent({ action: 'key.created' });
    await logAuditEvent({ action: 'settings.updated' });
    const stats = await getAuditStats();
    const keyCreated = stats.find(s => s.action === 'key.created');
    expect(keyCreated).toBeDefined();
    expect(keyCreated.count).toBeGreaterThanOrEqual(2);
  });

  it('handles missing optional fields gracefully', async () => {
    await expect(logAuditEvent({ action: 'minimal.event' })).resolves.not.toThrow();
    const logs = await getAuditLogs({ limit: 5 });
    expect(logs.some(l => l.action === 'minimal.event')).toBe(true);
  });
});
