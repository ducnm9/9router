// tests/unit/providerHealth.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { HealthTracker } from '../../src/lib/providerHealth.js';

describe('HealthTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new HealthTracker();
  });

  it('records successful request and reports healthy', () => {
    tracker.recordSuccess('claude-code', { latencyMs: 250, model: 'opus-4.7', connectionId: 'conn-1' });
    const health = tracker.getHealth('claude-code');
    expect(health.successRate).toBe(1.0);
    expect(health.avgLatencyMs).toBe(250);
    expect(health.status).toBe('healthy');
    expect(health.consecutiveFailures).toBe(0);
  });

  it('records failure and degrades health', () => {
    tracker.recordSuccess('glm', { latencyMs: 100 });
    tracker.recordFailure('glm', { statusCode: 503, error: 'Service Unavailable' });
    const health = tracker.getHealth('glm');
    expect(health.successRate).toBe(0.5);
    expect(health.status).toBe('degraded');
  });

  it('marks provider unhealthy after 3 consecutive failures', () => {
    for (let i = 0; i < 3; i++) {
      tracker.recordFailure('minimax', { statusCode: 500, error: 'Internal Error' });
    }
    const health = tracker.getHealth('minimax');
    expect(health.status).toBe('unhealthy');
    expect(health.consecutiveFailures).toBe(3);
  });

  it('resets consecutive failures on success', () => {
    for (let i = 0; i < 3; i++) {
      tracker.recordFailure('glm', { statusCode: 500 });
    }
    tracker.recordSuccess('glm', { latencyMs: 200 });
    const health = tracker.getHealth('glm');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.status).not.toBe('unhealthy');
  });

  it('returns unknown status for unseen provider', () => {
    const health = tracker.getHealth('unknown-provider');
    expect(health.status).toBe('unknown');
    expect(health.successRate).toBeNull();
  });

  it('ranks providers by health score (fastest+healthiest first)', () => {
    tracker.recordSuccess('fast', { latencyMs: 50 });
    tracker.recordSuccess('slow', { latencyMs: 2000 });
    tracker.recordFailure('broken', { statusCode: 500 });

    const ranked = tracker.getRankedProviders();
    expect(ranked[0].providerId).toBe('fast');
    expect(ranked[ranked.length - 1].providerId).toBe('broken');
  });

  it('calculates p50 and p95 latency from successes', () => {
    for (let i = 0; i < 100; i++) {
      tracker.recordSuccess('test', { latencyMs: i < 95 ? 100 : 500 });
    }
    const health = tracker.getHealth('test');
    expect(health.p50LatencyMs).toBeLessThanOrEqual(100);
    expect(health.p95LatencyMs).toBeGreaterThanOrEqual(100);
  });

  it('getAllHealth returns all tracked providers', () => {
    tracker.recordSuccess('p1', { latencyMs: 100 });
    tracker.recordSuccess('p2', { latencyMs: 200 });
    const all = tracker.getAllHealth();
    const ids = all.map(h => h.providerId);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('reset clears a provider record', () => {
    tracker.recordFailure('to-reset', { statusCode: 500 });
    tracker.reset('to-reset');
    expect(tracker.getHealth('to-reset').status).toBe('unknown');
  });
});
