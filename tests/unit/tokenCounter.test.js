// tests/unit/tokenCounter.test.js
import { describe, it, expect } from 'vitest';
import { StreamTokenCounter, estimateTokens } from '../../open-sse/utils/tokenCounter.js';

describe('StreamTokenCounter', () => {
  it('estimates tokens from character count (4 chars ≈ 1 token)', () => {
    expect(estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25 → ceil = 2
    expect(estimateTokens('word')).toBe(1);  // 4 chars / 4 = 1
    expect(estimateTokens('')).toBe(0);
  });

  it('counts input tokens from messages array', () => {
    const counter = new StreamTokenCounter();
    counter.countInput([{ role: 'user', content: 'Hello world' }]);
    expect(counter.estimatedInputTokens).toBeGreaterThan(0);
  });

  it('counts output chunks', () => {
    const counter = new StreamTokenCounter();
    counter.countChunk('Hello');
    counter.countChunk(' world');
    expect(counter.estimatedOutputTokens).toBeGreaterThan(0);
    expect(counter.chunks).toBe(2);
  });

  it('getEstimate returns all token fields', () => {
    const counter = new StreamTokenCounter();
    counter.countInput([{ role: 'user', content: 'test' }]);
    counter.countChunk('response text here');
    const est = counter.getEstimate();
    expect(est).toHaveProperty('estimatedInputTokens');
    expect(est).toHaveProperty('estimatedOutputTokens');
    expect(est).toHaveProperty('estimatedTotalTokens');
    expect(est).toHaveProperty('outputChunks');
    expect(est).toHaveProperty('note');
    expect(est.estimatedTotalTokens).toBe(est.estimatedInputTokens + est.estimatedOutputTokens);
  });

  it('toSSEEvent returns valid SSE format', () => {
    const counter = new StreamTokenCounter();
    counter.countChunk('test response');
    const sse = counter.toSSEEvent();
    expect(sse).toContain('event: token_usage');
    expect(sse).toContain('data: {');
    expect(sse.endsWith('\n\n')).toBe(true);
  });

  it('toHeader returns JSON string for X-Token-Usage header', () => {
    const counter = new StreamTokenCounter();
    counter.countInput([{ role: 'user', content: 'x' }]);
    counter.countChunk('response');
    const header = counter.toHeader();
    const parsed = JSON.parse(header);
    expect(parsed).toHaveProperty('input');
    expect(parsed).toHaveProperty('output');
    expect(parsed).toHaveProperty('total');
  });
});
