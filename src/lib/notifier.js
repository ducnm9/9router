// src/lib/notifier.js

/**
 * Multi-channel notification dispatcher with cooldown dedup.
 * Supports: webhook (generic), slack, discord, telegram.
 */
export class Notifier {
  constructor({ cooldownMs = 30 * 60 * 1000 } = {}) {
    this.channels = [];
    this.cooldownMs = cooldownMs;
    this.lastSent = new Map(); // "event:keyId" -> timestamp
  }

  addChannel(channel) {
    this.channels.push(channel);
  }

  setChannels(channels) {
    this.channels = channels || [];
  }

  async send(alert) {
    const dedupeKey = `${alert.event}:${alert.keyId || alert.keyName || 'global'}`;
    const now = Date.now();
    const lastTime = this.lastSent.get(dedupeKey);

    if (lastTime && (now - lastTime) < this.cooldownMs) {
      return; // Skip — within cooldown
    }

    this.lastSent.set(dedupeKey, now);

    const results = await Promise.allSettled(
      this.channels.map(ch => this._dispatch(ch, alert))
    );

    return results;
  }

  async _dispatch(channel, alert) {
    const type = channel.type || 'webhook';
    const body = formatAlertMessage(type, alert);
    const timeout = 10000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(channel.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[Notifier] ${type} webhook returned ${res.status}`);
      }
      return res;
    } catch (err) {
      console.warn(`[Notifier] ${type} webhook failed:`, err.message);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function formatAlertMessage(type, alert) {
  const { event, keyName, usage, limit, unit = 'tokens' } = alert;
  const isExceeded = event === 'budget_exceeded' || event === 'quota_exceeded';
  const verb = isExceeded ? 'exceeded' : 'approaching limit';
  const text = `[9Router] API key "${keyName || alert.keyId}" ${verb}: ${usage}/${limit} ${unit}`;

  switch (type) {
    case 'slack':
      return { text };
    case 'discord':
      return { content: text };
    case 'telegram':
      return { text, parse_mode: 'HTML' };
    default:
      return {
        event,
        keyName: keyName || alert.keyId,
        usage,
        limit,
        unit,
        message: text,
        timestamp: new Date().toISOString(),
      };
  }
}

// Singleton
let _instance = null;
export function getNotifier() {
  if (!_instance) _instance = new Notifier();
  return _instance;
}
