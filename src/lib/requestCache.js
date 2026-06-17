// src/lib/requestCache.js
import { createHash } from 'crypto';

/**
 * LRU cache for non-streaming, deterministic (temperature=0) LLM requests.
 * Key is a SHA-256 hash of model + messages + temperature.
 * Evicts by LRU (least recently accessed) when maxSize is exceeded.
 */
export class RequestCache {
  constructor({ maxSize = 500, ttlMs = 5 * 60 * 1000 } = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // key -> { value, expiresAt, accessedAt }
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Build a cache key for the request body.
   * Returns null if the request should not be cached.
   */
  buildKey(body) {
    if (!body) return null;
    if (body.stream) return null; // never cache streaming
    if (body.temperature != null && body.temperature > 0) return null; // non-deterministic

    const hashInput = JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature ?? 0,
      tools: body.tools
        ? body.tools.map(t => t.function?.name || t.name || '').sort().join(',')
        : undefined,
      system: body.system
    });

    return createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  }

  get(key) {
    if (!key) { this.misses++; return null; }
    const entry = this.cache.get(key);
    if (!entry) { this.misses++; return null; }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    entry.accessedAt = Date.now();
    this.hits++;
    return entry.value;
  }

  set(key, value) {
    if (!key) return;
    if (this.cache.size >= this.maxSize) {
      this._evictLRU();
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      accessedAt: Date.now()
    });
  }

  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 1000) / 1000 : 0
    };
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// Singleton
let _instance = null;
export function getRequestCache() {
  if (!_instance) _instance = new RequestCache();
  return _instance;
}
