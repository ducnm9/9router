import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/lib/rateLimiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
  });

  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('key-1')).toEqual({ allowed: true, remaining: 4 - i, resetMs: expect.any(Number) });
    }
  });

  it('blocks requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) limiter.check('key-1');
    const result = limiter.check('key-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates different keys', () => {
    for (let i = 0; i < 5; i++) limiter.check('key-1');
    expect(limiter.check('key-2').allowed).toBe(true);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) limiter.check('key-1');
    vi.advanceTimersByTime(60001);
    expect(limiter.check('key-1').allowed).toBe(true);
    vi.useRealTimers();
  });

  it('supports per-IP limiting', () => {
    const ipLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 10, keyPrefix: 'ip:' });
    for (let i = 0; i < 10; i++) ipLimiter.check('192.168.1.1');
    expect(ipLimiter.check('192.168.1.1').allowed).toBe(false);
    expect(ipLimiter.check('192.168.1.2').allowed).toBe(true);
  });
});
