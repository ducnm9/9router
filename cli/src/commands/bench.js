// cli/src/commands/bench.js
// Load test command for 9Router endpoint

'use strict';

function printHelp(appName) {
  console.log(`
Usage: ${appName} bench [options]

Run load test against the 9Router endpoint.

Options:
  -c, --concurrency <n>   Number of concurrent requests (default: 5)
  -n, --requests <n>      Total number of requests to send (default: 50)
  -m, --model <model>     Model to test (default: auto)
  -e, --endpoint <url>    Base URL of 9Router instance (default: http://localhost:20128)
  -p, --prompt <text>     Test prompt to send (default: "Say hello in one word.")
  -k, --key <token>       API key (Bearer token) — optional
  -h, --help              Show this help message
`);
}

function parseArgs(args) {
  const opts = {
    concurrency: 5,
    requests: 50,
    model: 'auto',
    endpoint: 'http://localhost:20128',
    prompt: 'Say hello in one word.',
    key: '',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if ((arg === '-c' || arg === '--concurrency') && next) {
      opts.concurrency = parseInt(next, 10) || 5;
      i++;
    } else if ((arg === '-n' || arg === '--requests') && next) {
      opts.requests = parseInt(next, 10) || 50;
      i++;
    } else if ((arg === '-m' || arg === '--model') && next) {
      opts.model = next;
      i++;
    } else if ((arg === '-e' || arg === '--endpoint') && next) {
      opts.endpoint = next;
      i++;
    } else if ((arg === '-p' || arg === '--prompt') && next) {
      opts.prompt = next;
      i++;
    } else if ((arg === '-k' || arg === '--key') && next) {
      opts.key = next;
      i++;
    }
  }

  return opts;
}

async function runBench(opts) {
  const { concurrency, requests, model, endpoint, prompt, key } = opts;
  const url = `${endpoint}/v1/chat/completions`;

  console.log('\n9Router Load Test');
  console.log('─'.repeat(50));
  console.log(`Endpoint:    ${url}`);
  console.log(`Model:       ${model}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Requests:    ${requests}`);
  console.log(`Prompt:      ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`);
  console.log('─'.repeat(50));

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 10,
    stream: false,
    temperature: 0
  });

  const results = [];
  let completed = 0;
  let errors = 0;

  const startTime = Date.now();

  async function runOne() {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      const elapsed = Date.now() - t0;
      const success = res.ok;
      if (!success) errors++;
      results.push({ status: res.status, elapsed, success });
    } catch (err) {
      errors++;
      results.push({ status: 0, elapsed: Date.now() - t0, success: false, error: err.message });
    } finally {
      clearTimeout(timer);
    }
    completed++;
    process.stdout.write(`\r  Progress: ${completed}/${requests} requests (${errors} errors)`);
  }

  // Concurrency pool
  const queue = Array.from({ length: requests });
  const workers = Array.from({ length: Math.min(concurrency, requests) }, async () => {
    while (queue.length > 0) {
      queue.pop();
      await runOne();
    }
  });

  await Promise.all(workers);

  const totalMs = Date.now() - startTime;
  const successful = results.filter(r => r.success);
  const latencies = successful.map(r => r.elapsed).sort((a, b) => a - b);

  console.log('\n');
  console.log('─'.repeat(50));
  console.log('Results');
  console.log('─'.repeat(50));
  console.log(`Total time:     ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Completed:      ${requests} requests`);
  console.log(`Successful:     ${successful.length} (${((successful.length / requests) * 100).toFixed(1)}%)`);
  console.log(`Failed:         ${errors}`);
  console.log(`Throughput:     ${(requests / (totalMs / 1000)).toFixed(2)} req/s`);

  if (latencies.length > 0) {
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? latencies[latencies.length - 1];
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    console.log('\nLatency (successful requests):');
    console.log(`  Min:  ${min}ms`);
    console.log(`  Avg:  ${avg}ms`);
    console.log(`  p50:  ${p50}ms`);
    console.log(`  p95:  ${p95}ms`);
    console.log(`  p99:  ${p99}ms`);
    console.log(`  Max:  ${max}ms`);
  }

  // Status code breakdown
  const statusCounts = {};
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  console.log('\nStatus codes:');
  for (const [code, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${code}: ${count}`);
  }
  console.log('─'.repeat(50));
}

module.exports = { parseArgs, printHelp, runBench };
