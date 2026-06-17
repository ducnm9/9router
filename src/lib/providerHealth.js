// src/lib/providerHealth.js

const WINDOW_SIZE = 100;           // Keep last N records per provider
const UNHEALTHY_THRESHOLD = 3;     // Consecutive failures to mark unhealthy
const DEGRADED_SUCCESS_RATE = 0.8; // Below this = degraded

export class HealthTracker {
  constructor() {
    this.records = new Map();    // providerId -> [{timestamp, success, latencyMs, statusCode, error}]
    this.consecutive = new Map(); // providerId -> consecutiveFailures count
  }

  recordSuccess(providerId, { latencyMs, model, connectionId } = {}) {
    this._addRecord(providerId, { success: true, latencyMs: latencyMs ?? null });
    this.consecutive.set(providerId, 0);
  }

  recordFailure(providerId, { statusCode, error, model, connectionId } = {}) {
    this._addRecord(providerId, { success: false, statusCode, error });
    const prev = this.consecutive.get(providerId) || 0;
    this.consecutive.set(providerId, prev + 1);
  }

  _addRecord(providerId, record) {
    if (!this.records.has(providerId)) {
      this.records.set(providerId, []);
    }
    const records = this.records.get(providerId);
    records.push({ ...record, timestamp: Date.now() });
    if (records.length > WINDOW_SIZE) {
      records.shift();
    }
  }

  getHealth(providerId) {
    const records = this.records.get(providerId) || [];
    if (records.length === 0) {
      return {
        providerId,
        status: 'unknown',
        successRate: null,
        avgLatencyMs: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        lastSuccess: null,
        lastFailure: null
      };
    }

    const successes = records.filter(r => r.success);
    const successRate = successes.length / records.length;
    const consecutiveFailures = this.consecutive.get(providerId) || 0;

    // Latency stats from successes only
    const latencies = successes
      .map(r => r.latencyMs)
      .filter(l => l != null)
      .sort((a, b) => a - b);

    const avgLatencyMs = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    const p50LatencyMs = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.5)]
      : null;
    const p95LatencyMs = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.95)]
      : null;

    let status = 'healthy';
    if (consecutiveFailures >= UNHEALTHY_THRESHOLD) {
      status = 'unhealthy';
    } else if (successRate < DEGRADED_SUCCESS_RATE) {
      status = 'degraded';
    }

    return {
      providerId,
      status,
      successRate: Math.round(successRate * 1000) / 1000,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      consecutiveFailures,
      totalRequests: records.length,
      lastSuccess: successes.length > 0 ? successes[successes.length - 1].timestamp : null,
      lastFailure: records.filter(r => !r.success).slice(-1)[0]?.timestamp || null
    };
  }

  getRankedProviders() {
    const providers = [...this.records.keys()];
    return providers
      .map(id => this.getHealth(id))
      .sort((a, b) => {
        // Unhealthy last
        if (a.status === 'unhealthy' && b.status !== 'unhealthy') return 1;
        if (b.status === 'unhealthy' && a.status !== 'unhealthy') return -1;
        // Score: successRate weighted by inverse latency
        const scoreA = (a.successRate ?? 0) * (1000 / Math.max(a.avgLatencyMs ?? 1000, 1));
        const scoreB = (b.successRate ?? 0) * (1000 / Math.max(b.avgLatencyMs ?? 1000, 1));
        return scoreB - scoreA;
      });
  }

  getAllHealth() {
    return [...this.records.keys()].map(id => this.getHealth(id));
  }

  reset(providerId) {
    this.records.delete(providerId);
    this.consecutive.delete(providerId);
  }
}

// Singleton
let _instance = null;
export function getHealthTracker() {
  if (!_instance) _instance = new HealthTracker();
  return _instance;
}
