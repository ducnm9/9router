// tests/unit/pluginHooks.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { registerHook, runHook, clearHooks, getRegisteredHooks, HOOKS } from '../../src/lib/plugins/hooks.js';

describe('Plugin Hooks', () => {
  beforeEach(() => clearHooks());

  it('registers and runs a hook', async () => {
    let called = false;
    registerHook('request:before', () => { called = true; }, { pluginId: 'test' });
    await runHook('request:before', {});
    expect(called).toBe(true);
  });

  it('passes context through hook chain and returns modified context', async () => {
    registerHook('request:before', (ctx) => ({ ...ctx, modified: true }), { pluginId: 'test' });
    const result = await runHook('request:before', { original: true });
    expect(result.modified).toBe(true);
    expect(result.original).toBe(true);
  });

  it('runs hooks in priority order (lower number = first)', async () => {
    const order = [];
    registerHook('request:before', () => { order.push('second'); }, { priority: 20, pluginId: 'b' });
    registerHook('request:before', () => { order.push('first'); }, { priority: 5, pluginId: 'a' });
    await runHook('request:before', {});
    expect(order).toEqual(['first', 'second']);
  });

  it('handles hook errors gracefully — other hooks still run', async () => {
    const order = [];
    registerHook('request:before', () => { throw new Error('boom'); }, { pluginId: 'bad' });
    registerHook('request:before', () => { order.push('ran'); }, { pluginId: 'good' });
    await runHook('request:before', {});
    expect(order).toContain('ran');
  });

  it('throws on unknown hook name', () => {
    expect(() => registerHook('unknown:hook', () => {})).toThrow('Unknown hook');
  });

  it('HOOKS export contains expected hook names', () => {
    expect(Object.keys(HOOKS)).toContain('request:before');
    expect(Object.keys(HOOKS)).toContain('request:after');
    expect(Object.keys(HOOKS)).toContain('provider:success');
    expect(Object.keys(HOOKS)).toContain('provider:failure');
    expect(Object.keys(HOOKS)).toContain('system:startup');
  });

  it('getRegisteredHooks returns registered handlers summary', () => {
    registerHook('request:before', () => {}, { pluginId: 'my-plugin', priority: 10 });
    const summary = getRegisteredHooks();
    expect(summary['request:before']).toBeDefined();
    expect(summary['request:before'].some(h => h.pluginId === 'my-plugin')).toBe(true);
  });

  it('clearHooks removes all handlers', async () => {
    let called = false;
    registerHook('request:before', () => { called = true; }, { pluginId: 'test' });
    clearHooks();
    await runHook('request:before', {});
    expect(called).toBe(false);
  });
});
