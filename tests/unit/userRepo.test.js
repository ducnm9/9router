// tests/unit/userRepo.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '9router-userrepo-'));
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

describe('User Repository', () => {
  it('creates a user and retrieves by id', async () => {
    const { createUser, getUserById } = await import('@/lib/db/repos/userRepo.js');
    const u = await createUser({ email: 'test1@example.com', name: 'Test One', role: 'member' });
    expect(u.id).toBeDefined();
    expect(u.email).toBe('test1@example.com');
    expect(u.role).toBe('member');
    const found = await getUserById(u.id);
    expect(found.name).toBe('Test One');
  });

  it('retrieves user by email', async () => {
    const { createUser, getUserByEmail } = await import('@/lib/db/repos/userRepo.js');
    await createUser({ email: 'byemail@example.com', name: 'Email User' });
    const found = await getUserByEmail('byemail@example.com');
    expect(found).not.toBeNull();
    expect(found.email).toBe('byemail@example.com');
  });

  it('retrieves user by oidcSub', async () => {
    const { createUser, getUserByOidcSub } = await import('@/lib/db/repos/userRepo.js');
    await createUser({ email: 'oidc@example.com', name: 'OIDC User', oidcSub: 'sub|12345' });
    const found = await getUserByOidcSub('sub|12345');
    expect(found.oidcSub).toBe('sub|12345');
  });

  it('lists all users', async () => {
    const { createUser, getUsers } = await import('@/lib/db/repos/userRepo.js');
    await createUser({ email: 'list1@example.com', name: 'List One' });
    await createUser({ email: 'list2@example.com', name: 'List Two' });
    const all = await getUsers();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('updates user role', async () => {
    const { createUser, updateUser } = await import('@/lib/db/repos/userRepo.js');
    const u = await createUser({ email: 'update@example.com', name: 'Update Me' });
    const updated = await updateUser(u.id, { role: 'admin' });
    expect(updated.role).toBe('admin');
  });

  it('deletes a user', async () => {
    const { createUser, deleteUser, getUserById } = await import('@/lib/db/repos/userRepo.js');
    const u = await createUser({ email: 'delete@example.com', name: 'Delete Me' });
    await deleteUser(u.id);
    expect(await getUserById(u.id)).toBeUndefined();
  });

  it('findOrCreateFromOidc creates new user', async () => {
    const { findOrCreateFromOidc } = await import('@/lib/db/repos/userRepo.js');
    const u = await findOrCreateFromOidc({ sub: 'sub|new1', email: 'new@example.com', name: 'New User' });
    expect(u.oidcSub).toBe('sub|new1');
    expect(u.email).toBe('new@example.com');
  });

  it('findOrCreateFromOidc returns existing user by oidcSub', async () => {
    const { findOrCreateFromOidc } = await import('@/lib/db/repos/userRepo.js');
    const u1 = await findOrCreateFromOidc({ sub: 'sub|existing', email: 'existing@example.com', name: 'Existing' });
    const u2 = await findOrCreateFromOidc({ sub: 'sub|existing', email: 'existing@example.com', name: 'Existing Updated' });
    expect(u1.id).toBe(u2.id);
  });

  it('first user created gets admin role', async () => {
    const { findOrCreateFromOidc, getUsers } = await import('@/lib/db/repos/userRepo.js');
    // Fresh DB — no users yet
    const existing = await getUsers();
    if (existing.length === 0) {
      const u = await findOrCreateFromOidc({ sub: 'sub|first', email: 'first@example.com', name: 'First' });
      expect(u.role).toBe('admin');
    }
  });
});
