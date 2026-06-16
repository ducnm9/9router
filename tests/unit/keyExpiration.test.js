// tests/unit/keyExpiration.test.js
import { describe, it, expect } from 'vitest';
import { isKeyExpired, getExpirationStatus } from '../../src/lib/db/repos/apiKeysRepo.js';

describe('API Key Expiration', () => {
  it('returns false for key with no expiration', () => {
    expect(isKeyExpired({ expiresAt: null })).toBe(false);
  });

  it('returns false for key expiring in the future', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isKeyExpired({ expiresAt: future })).toBe(false);
  });

  it('returns true for expired key', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isKeyExpired({ expiresAt: past })).toBe(true);
  });

  it('getExpirationStatus returns days remaining', () => {
    const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString();
    const status = getExpirationStatus({ expiresAt: inThreeDays });
    expect(status.expired).toBe(false);
    expect(status.daysRemaining).toBeGreaterThanOrEqual(2);
    expect(status.daysRemaining).toBeLessThanOrEqual(3);
  });

  it('getExpirationStatus flags warning within 7 days', () => {
    const inFiveDays = new Date(Date.now() + 5 * 86400000).toISOString();
    const status = getExpirationStatus({ expiresAt: inFiveDays });
    expect(status.warning).toBe(true);
  });
});
