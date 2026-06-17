// tests/unit/rbac.test.js
import { describe, it, expect } from 'vitest';
import { ROLES, hasPermission, canAccessRoute, getRoleNames } from '../../src/lib/rbac.js';

describe('RBAC', () => {
  it('admin has all permissions via wildcard', () => {
    expect(hasPermission('admin', 'users:manage')).toBe(true);
    expect(hasPermission('admin', 'settings:write')).toBe(true);
    expect(hasPermission('admin', 'keys:delete')).toBe(true);
    expect(hasPermission('admin', 'audit:read')).toBe(true);
    expect(hasPermission('admin', 'anything:else')).toBe(true);
  });

  it('member can use chat API and view own resources', () => {
    expect(hasPermission('member', 'chat:use')).toBe(true);
    expect(hasPermission('member', 'usage:read:own')).toBe(true);
    expect(hasPermission('member', 'keys:read:own')).toBe(true);
    expect(hasPermission('member', 'models:read')).toBe(true);
    expect(hasPermission('member', 'combos:read')).toBe(true);
  });

  it('member cannot manage users or change settings', () => {
    expect(hasPermission('member', 'users:manage')).toBe(false);
    expect(hasPermission('member', 'settings:write')).toBe(false);
    expect(hasPermission('member', 'keys:delete')).toBe(false);
    expect(hasPermission('member', 'audit:read')).toBe(false);
  });

  it('viewer can only read own usage and browse models', () => {
    expect(hasPermission('viewer', 'usage:read:own')).toBe(true);
    expect(hasPermission('viewer', 'models:read')).toBe(true);
    expect(hasPermission('viewer', 'combos:read')).toBe(true);
    expect(hasPermission('viewer', 'chat:use')).toBe(false);
    expect(hasPermission('viewer', 'settings:write')).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(hasPermission('unknown_role', 'chat:use')).toBe(false);
    expect(hasPermission(null, 'chat:use')).toBe(false);
    expect(hasPermission(undefined, 'chat:use')).toBe(false);
  });

  it('canAccessRoute admin can access /api/users', () => {
    expect(canAccessRoute('admin', '/api/users')).toBe(true);
    expect(canAccessRoute('admin', '/api/settings')).toBe(true);
    expect(canAccessRoute('admin', '/api/audit')).toBe(true);
  });

  it('canAccessRoute member cannot access /api/users', () => {
    expect(canAccessRoute('member', '/api/users')).toBe(false);
    expect(canAccessRoute('member', '/api/audit')).toBe(false);
  });

  it('canAccessRoute member can use chat API', () => {
    expect(canAccessRoute('member', '/api/v1/chat/completions')).toBe(true);
    expect(canAccessRoute('member', '/api/v1/models')).toBe(true);
  });

  it('getRoleNames returns all defined roles', () => {
    const names = getRoleNames();
    expect(names).toContain('admin');
    expect(names).toContain('member');
    expect(names).toContain('viewer');
  });

  it('ROLES export has required structure', () => {
    expect(ROLES.admin).toBeDefined();
    expect(ROLES.member).toBeDefined();
    expect(ROLES.viewer).toBeDefined();
    expect(Array.isArray(ROLES.admin.permissions)).toBe(true);
    expect(ROLES.admin.permissions).toContain('*');
  });
});
