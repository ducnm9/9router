// src/lib/plugins/hooks.js

/**
 * Plugin hook system.
 * Hooks run in priority order (lower number = first).
 * Each hook can modify and return the context (or return undefined to pass through unchanged).
 * Hook errors are caught — they warn but never crash the request.
 */

export const HOOKS = {
  'request:before':   [],  // Before routing — can modify request body
  'request:after':    [],  // After response — can modify response
  'request:error':    [],  // On error
  'provider:select':  [],  // Before provider selection
  'provider:success': [],  // After successful provider call
  'provider:failure': [],  // After failed provider call
  'tokens:before':    [],  // Before RTK compression
  'tokens:after':     [],  // After RTK compression
  'system:startup':   [],  // On app start
  'system:shutdown':  [],  // On app stop
};

// Registry: hook name -> [{fn, priority, pluginId}]
const registry = new Map(Object.keys(HOOKS).map(k => [k, []]));

export function registerHook(hookName, fn, { priority = 10, pluginId = 'unknown' } = {}) {
  if (!registry.has(hookName)) {
    throw new Error(`Unknown hook: "${hookName}". Valid hooks: ${[...registry.keys()].join(', ')}`);
  }
  if (typeof fn !== 'function') {
    throw new Error(`registerHook: handler must be a function, got ${typeof fn}`);
  }
  const handlers = registry.get(hookName);
  handlers.push({ fn, priority, pluginId });
  handlers.sort((a, b) => a.priority - b.priority);
}

export async function runHook(hookName, context) {
  const handlers = registry.get(hookName) || [];
  let result = context;
  for (const handler of handlers) {
    try {
      const output = await handler.fn(result);
      if (output !== undefined) result = output;
    } catch (err) {
      console.warn(`[Plugin:${handler.pluginId}] Hook "${hookName}" error:`, err.message);
    }
  }
  return result;
}

export function getRegisteredHooks() {
  const summary = {};
  for (const [name, handlers] of registry) {
    summary[name] = handlers.map(h => ({ pluginId: h.pluginId, priority: h.priority }));
  }
  return summary;
}

export function clearHooks() {
  for (const [name] of registry) {
    registry.set(name, []);
  }
}
