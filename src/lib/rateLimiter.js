/**
 * In-memory sliding window rate limiter.
 * Supports per-key (API key) and per-IP limiting.
 * Auto-cleans expired entries every 5 minutes.
 */
export class RateLimiter {
  constructor({ windowMs = 60000, maxRequests = 60, keyPrefix = '' } = {}) {
    if (maxRequests <= 0) throw new Error('RateLimiter: maxRequests must be > 0');
    if (windowMs <= 0) throw new Error('RateLimiter: windowMs must be > 0');
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.keyPrefix = keyPrefix;
    this.windows = new Map(); // key -> [timestamp, ...]

    // Auto-cleanup every 5 minutes
    if (typeof setInterval !== 'undefined') {
      this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
      if (this._cleanupInterval?.unref) this._cleanupInterval.unref();
    }
  }

  check(key) {
    if (key == null) throw new Error('RateLimiter.check: key must not be null or undefined');
    const fullKey = this.keyPrefix + key;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.windows.has(fullKey)) {
      this.windows.set(fullKey, []);
    }

    const timestamps = this.windows.get(fullKey);
    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length < this.maxRequests) {
      timestamps.push(now);
      return {
        allowed: true,
        remaining: this.maxRequests - timestamps.length,
        resetMs: timestamps[0] + this.windowMs - now,
      };
    }

    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + this.windowMs - now;

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      resetMs: retryAfterMs,
    };
  }

  reset(key) {
    this.windows.delete(this.keyPrefix + key);
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const windowStart = now - this.windowMs;
      while (timestamps.length > 0 && timestamps[0] <= windowStart) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  destroy() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
    this.windows.clear();
  }
}

// Singleton instances for the app
export const apiKeyLimiter = new RateLimiter({
  windowMs: 60 * 1000,  // 1 minute window
  maxRequests: 60,       // 60 req/min per key (default)
  keyPrefix: 'apikey:',
});

export const ipLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,      // 120 req/min per IP (default)
  keyPrefix: 'ip:',
});
