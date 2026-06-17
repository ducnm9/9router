// src/lib/rbac.js

/**
 * Role-based access control.
 * Three roles: admin (full), member (API use + own resources), viewer (read-only).
 */
export const ROLES = {
  admin: {
    name: 'Admin',
    description: 'Full access to everything',
    permissions: ['*']
  },
  member: {
    name: 'Member',
    description: 'Can use AI API, manage own keys, view own usage',
    permissions: [
      'chat:use',
      'keys:read:own',
      'keys:create:own',
      'usage:read:own',
      'combos:read',
      'models:read',
      'providers:read'
    ]
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to own usage and models',
    permissions: [
      'usage:read:own',
      'models:read',
      'combos:read'
    ]
  }
};

/**
 * Route → permission mapping.
 * First match wins. More specific patterns should come first.
 */
const ROUTE_PERMISSIONS = [
  { pattern: /^\/api\/users/,          permission: 'users:manage' },
  { pattern: /^\/api\/audit/,          permission: 'audit:read' },
  { pattern: /^\/api\/settings/,       permission: 'settings:write' },
  { pattern: /^\/api\/providers/,      permission: 'providers:write' },
  { pattern: /^\/api\/pricing/,        permission: 'settings:write' },
  { pattern: /^\/api\/plugins/,        permission: 'settings:write' },
  { pattern: /^\/api\/cache/,          permission: 'settings:write' },
  { pattern: /^\/api\/provider-nodes/, permission: 'settings:write' },
  { pattern: /^\/api\/proxy-pools/,    permission: 'settings:write' },
  { pattern: /^\/api\/keys/,           permission: 'keys:read:own' },
  { pattern: /^\/api\/usage/,          permission: 'usage:read:own' },
  { pattern: /^\/api\/combos/,         permission: 'combos:read' },
  { pattern: /^\/api\/models/,         permission: 'models:read' },
  { pattern: /^\/api\/templates/,      permission: 'combos:read' },
];

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role, permission) {
  if (!role) return false;
  const roleDef = ROLES[role];
  if (!roleDef) return false;
  if (roleDef.permissions.includes('*')) return true;
  return roleDef.permissions.includes(permission);
}

/**
 * Check if a role can access a given route path.
 * Returns true if no restriction is defined for the path.
 */
export function canAccessRoute(role, path) {
  const match = ROUTE_PERMISSIONS.find(r => r.pattern.test(path));
  if (!match) return true; // No restriction defined = allow
  return hasPermission(role, match.permission);
}

/**
 * Get all defined role names.
 */
export function getRoleNames() {
  return Object.keys(ROLES);
}

/**
 * Get role definition.
 */
export function getRoleDefinition(role) {
  return ROLES[role] || null;
}
