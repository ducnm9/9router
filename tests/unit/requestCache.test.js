// tests/unit/requestCache.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestCache } from '../../src/lib/requestCache.js';

describe('RequestCache', () => {
  let cache;

  beforeEach(() => {
    cache = new RequestCache({ maxSize: 100, ttlMs: 60000 });
  });

  it('stores and retrieves a cached response', () => {
    const key = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], temperature: 0 });
    expect(key).not.toBeNull();
    cache.set(key, { content: 'Hi there!', usage: { total: 10 } });
    const hit = cache.get(key);
    expect(hit).not.toBeNull();
    expect(hit.content).toBe('Hi there!');
  });

  it('returns null for uncached request', () => {
    const key = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'unknown' }], temperature: 0 });
    expect(cache.get(key)).toBeNull();
  });

  it('does not cache streaming requests (buildKey returns null)', () => {
    const key = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], stream: true });
    expect(key).toBeNull();
  });

  it('does not cache requests with temperature > 0', () => {
    const key = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], temperature: 0.7 });
    expect(key).toBeNull();
  });

  it('evicts expired entries on get', () => {
    vi.useFakeTimers();
    try {
      const key = cache.buildKey({ model: 'test', messages: [{ role: 'user', content: 'x' }], temperature: 0 });
      cache.set(key, { content: 'cached' });
      vi.advanceTimersByTime(60001);
      expect(cache.get(key)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts LRU entry when maxSize exceeded', () => {
    const smallCache = new RequestCache({ maxSize: 3, ttlMs: 60000 });
    for (let i = 0; i < 4; i++) {
      const key = smallCache.buildKey({ model: 'test', messages: [{ role: 'user', content: `msg-${i}` }], temperature: 0 });
      smallCache.set(key, { content: `response-${i}` });
    }
    const firstKey = smallCache.buildKey({ model: 'test', messages: [{ role: 'user', content: 'msg-0' }], temperature: 0 });
    expect(smallCache.get(firstKey)).toBeNull();
  });

  it('generates same key for identical requests', () => {
    const key1 = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'same' }], temperature: 0 });
    const key2 = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'same' }], temperature: 0 });
    expect(key1).toBe(key2);
  });

  it('generates different keys for different messages', () => {
    const key1 = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], temperature: 0 });
    const key2 = cache.buildKey({ model: 'gpt-4', messages: [{ role: 'user', content: 'world' }], temperature: 0 });
    expect(key1).not.toBe(key2);
  });

  it('getStats returns hits, misses, and hit rate', () => {
    const key = cache.buildKey({ model: 'test', messages: [{ role: 'user', content: 'q' }], temperature: 0 });
    cache.set(key, { content: 'a' });
    cache.get(key); // hit
    cache.get('nonexistent'); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.size).toBe(1);
  });

  it('clear() empties the cache and resets stats', () => {
    const key = cache.buildKey({ model: 'test', messages: [{ role: 'user', content: 'q' }], temperature: 0 });
    cache.set(key, { content: 'a' });
    cache.get(key);
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
  });
});
