// open-sse/utils/tokenCounter.js

/**
 * Lightweight streaming token counter.
 * Uses character-based approximation: ceil(chars / 4) ≈ tokens.
 * Not exact — use for tracking trends, not billing.
 */

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export class StreamTokenCounter {
  constructor() {
    this.inputChars = 0;
    this.outputChars = 0;
    this.chunks = 0;
  }

  get estimatedInputTokens() {
    return Math.ceil(this.inputChars / 4);
  }

  get estimatedOutputTokens() {
    return Math.ceil(this.outputChars / 4);
  }

  countInput(messages) {
    if (!messages) return;
    const text = Array.isArray(messages)
      ? messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join(' ')
      : typeof messages === 'string' ? messages : JSON.stringify(messages);
    this.inputChars = text.length;
  }

  countChunk(content) {
    if (!content) return;
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    this.outputChars += text.length;
    this.chunks++;
  }

  getEstimate() {
    const input = this.estimatedInputTokens;
    const output = this.estimatedOutputTokens;
    return {
      estimatedInputTokens: input,
      estimatedOutputTokens: output,
      estimatedTotalTokens: input + output,
      outputChunks: this.chunks,
      note: 'estimate_4chars_per_token'
    };
  }

  toSSEEvent() {
    const estimate = this.getEstimate();
    return `event: token_usage\ndata: ${JSON.stringify(estimate)}\n\n`;
  }

  toHeader() {
    const input = this.estimatedInputTokens;
    const output = this.estimatedOutputTokens;
    return JSON.stringify({ input, output, total: input + output });
  }
}
