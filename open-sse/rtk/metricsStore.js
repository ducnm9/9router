/**
 * Singleton metrics store for RTK and Caveman statistics.
 * Maintains rolling windows of 1000 entries each via CircularBuffer.
 * Persists across requests within the same server process.
 * Data resets on server restart (in-memory only).
 */

// ---------------------------------------------------------------------------
// CircularBuffer
// ---------------------------------------------------------------------------

export class CircularBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;   // index where next item will be written
    this.size = 0;   // current number of items stored
  }

  /** O(1) insert; evicts the oldest item when the buffer is full. */
  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  /**
   * Returns all items in insertion order (oldest → newest).
   * @returns {Array}
   */
  toArray() {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      // Buffer hasn't wrapped yet — items live from index 0 to size-1.
      return this.buffer.slice(0, this.size);
    }
    // Buffer has wrapped; head points to the oldest slot.
    const tail = this.buffer.slice(this.head, this.capacity);
    const front = this.buffer.slice(0, this.head);
    return tail.concat(front);
  }

  /**
   * Returns the most recent N items in insertion order (oldest → newest).
   * If N >= size, returns all items.
   * @param {number} n
   * @returns {Array}
   */
  last(n) {
    if (n <= 0) return [];
    const all = this.toArray();
    if (n >= all.length) return all;
    return all.slice(all.length - n);
  }

  /** Current number of items stored. */
  get length() {
    return this.size;
  }
}

// ---------------------------------------------------------------------------
// Internal state (singleton)
// ---------------------------------------------------------------------------

const WINDOW_SIZE = 1000;

const state = {
  rtk: {
    events: new CircularBuffer(WINDOW_SIZE),
    totalBytesBefore: 0,
    totalBytesAfter: 0,
    totalHits: 0,
    /** @type {Map<string, number>} */
    hitsByFilter: new Map(),
  },
  caveman: {
    events: new CircularBuffer(WINDOW_SIZE),
    totalRequests: 0,
    /** @type {Map<string, number>} */
    countByLevel: new Map(),
    /** @type {Map<string, number>} */
    countByFormat: new Map(),
  },
};

// ---------------------------------------------------------------------------
// RTK metrics
// ---------------------------------------------------------------------------

/**
 * Record a compression event from the stats object returned by compressMessages().
 * Shape: { bytesBefore: number, bytesAfter: number, hits: [{ filter, shape, saved }] }
 *
 * Null input is a no-op (compressMessages returns null when RTK is disabled or
 * when the request produced no compressible content).
 *
 * @param {{ bytesBefore: number, bytesAfter: number, hits: Array }} stats
 */
export function recordRtk(stats) {
  if (stats == null) return;
  try {
    const { bytesBefore, bytesAfter, hits } = stats;

    const ratio = bytesBefore > 0 ? 1 - bytesAfter / bytesBefore : 0;

    /** @type {RtkEvent} */
    const event = {
      timestamp: Date.now(),
      bytesBefore,
      bytesAfter,
      ratio,
      hits: Array.isArray(hits) ? hits.slice() : [],
    };

    state.rtk.events.push(event);
    state.rtk.totalBytesBefore += bytesBefore;
    state.rtk.totalBytesAfter += bytesAfter;
    state.rtk.totalHits += event.hits.length;

    for (const hit of event.hits) {
      const filter = hit.filter || "unknown";
      state.rtk.hitsByFilter.set(filter, (state.rtk.hitsByFilter.get(filter) ?? 0) + 1);
    }
  } catch (err) {
    console.warn("[metricsStore] recordRtk error:", err.message);
  }
}

/**
 * Returns RTK summary aggregates and the most recent 20 events.
 *
 * @returns {{
 *   aggregates: {
 *     totalBytesBefore: number,
 *     totalBytesAfter: number,
 *     compressionPct: number,
 *     totalHits: number,
 *     hitsByFilter: Record<string, number>
 *   },
 *   recentEvents: Array
 * }}
 */
export function getRtkSummary() {
  const { totalBytesBefore, totalBytesAfter, totalHits, hitsByFilter, events } = state.rtk;

  const compressionPct =
    totalBytesBefore > 0
      ? parseFloat(((1 - totalBytesAfter / totalBytesBefore) * 100).toFixed(2))
      : 0;

  return {
    aggregates: {
      totalBytesBefore,
      totalBytesAfter,
      compressionPct,
      totalHits,
      hitsByFilter: Object.fromEntries(hitsByFilter),
    },
    recentEvents: events.last(20),
  };
}

/**
 * Returns the last `limit` RTK events for charting (default 100).
 * @param {number} [limit=100]
 * @returns {Array}
 */
export function getRtkTimeSeries(limit = 100) {
  return state.rtk.events.last(limit);
}

// ---------------------------------------------------------------------------
// Caveman metrics
// ---------------------------------------------------------------------------

/**
 * Record a caveman-enabled response.
 *
 * @param {{ level: string, model: string, outputTokens: number|null, format?: string }} param0
 */
export function recordCaveman({ level, model, outputTokens, format }) {
  try {
    const resolvedFormat = format || "unknown";

    /** @type {CavemanEvent} */
    const event = {
      timestamp: Date.now(),
      level: level || "unknown",
      model: model || "unknown",
      outputTokens: outputTokens != null ? outputTokens : null,
      format: resolvedFormat,
    };

    state.caveman.events.push(event);
    state.caveman.totalRequests += 1;

    const lvl = event.level;
    state.caveman.countByLevel.set(lvl, (state.caveman.countByLevel.get(lvl) ?? 0) + 1);

    state.caveman.countByFormat.set(
      resolvedFormat,
      (state.caveman.countByFormat.get(resolvedFormat) ?? 0) + 1
    );
  } catch (err) {
    console.warn("[metricsStore] recordCaveman error:", err.message);
  }
}

/**
 * Returns Caveman summary aggregates and the most recent 20 events.
 *
 * @returns {{
 *   aggregates: {
 *     totalRequests: number,
 *     countByLevel: Record<string, number>,
 *     countByFormat: Record<string, number>
 *   },
 *   recentEvents: Array
 * }}
 */
export function getCavemanSummary() {
  const { totalRequests, countByLevel, countByFormat, events } = state.caveman;

  return {
    aggregates: {
      totalRequests,
      countByLevel: Object.fromEntries(countByLevel),
      countByFormat: Object.fromEntries(countByFormat),
    },
    recentEvents: events.last(20),
  };
}

/**
 * Returns the last `limit` Caveman events for charting (default 100).
 * @param {number} [limit=100]
 * @returns {Array}
 */
export function getCavemanTimeSeries(limit = 100) {
  return state.caveman.events.last(limit);
}
