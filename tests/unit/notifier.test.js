// tests/unit/notifier.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Notifier, formatAlertMessage } from '../../src/lib/notifier.js';

describe('Notifier', () => {
  let notifier;

  beforeEach(() => {
    notifier = new Notifier();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends webhook to configured URL', async () => {
    notifier.addChannel({ type: 'webhook', url: 'https://hooks.example.com/alert', name: 'test' });
    await notifier.send({ event: 'quota_warning', keyName: 'my-key', usage: 80, limit: 100 });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.example.com/alert',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('formats slack message correctly', () => {
    const msg = formatAlertMessage('slack', {
      event: 'quota_warning',
      keyName: 'prod-key',
      usage: 85,
      limit: 100,
      unit: 'tokens (K)'
    });
    expect(msg.text).toContain('prod-key');
    expect(msg.text).toContain('85');
  });

  it('formats discord message correctly', () => {
    const msg = formatAlertMessage('discord', {
      event: 'budget_exceeded',
      keyName: 'dev-key',
      usage: 50.5,
      limit: 50,
      unit: 'USD'
    });
    expect(msg.content).toContain('dev-key');
    expect(msg.content).toContain('exceeded');
  });

  it('does not send duplicate alerts within cooldown', async () => {
    notifier.addChannel({ type: 'webhook', url: 'https://hooks.example.com/alert', name: 'test' });
    await notifier.send({ event: 'quota_warning', keyId: 'k1' });
    await notifier.send({ event: 'quota_warning', keyId: 'k1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('formats provider_down message correctly', () => {
    const msg = formatAlertMessage('slack', {
      event: 'provider_down',
      provider: 'claude-code',
      error: 'Rate limit exceeded',
      failures: 3
    });
    expect(msg.text).toContain('claude-code');
    expect(msg.text).toContain('DOWN');
    expect(msg.text).toContain('3');
  });

  it('formats fallback_triggered message correctly', () => {
    const msg = formatAlertMessage('discord', {
      event: 'fallback_triggered',
      from: 'cc/claude-opus-4.7',
      to: 'glm/glm-5',
      reason: 'quota_exhausted'
    });
    expect(msg.content).toContain('cc/claude-opus-4.7');
    expect(msg.content).toContain('glm/glm-5');
    expect(msg.content).toContain('quota_exhausted');
  });

  it('sends again after cooldown expires', async () => {
    vi.useFakeTimers();
    try {
      notifier = new Notifier({ cooldownMs: 5000 });
      notifier.addChannel({ type: 'webhook', url: 'https://hooks.example.com/alert', name: 'test' });
      await notifier.send({ event: 'quota_warning', keyId: 'k1' });
      vi.advanceTimersByTime(5001);
      await notifier.send({ event: 'quota_warning', keyId: 'k1' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
