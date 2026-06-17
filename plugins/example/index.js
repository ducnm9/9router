// plugins/example/index.js
// Example 9Router plugin — disabled by default

export function register({ registerHook, pluginId }) {
  registerHook('request:before', (context) => {
    // Log request info — return context unchanged
    if (context?.body?.model) {
      console.log(`[${pluginId}] Request to model: ${context.body.model}`);
    }
    return context;
  }, { pluginId, priority: 50 });

  registerHook('provider:success', (context) => {
    if (context?.provider) {
      console.log(`[${pluginId}] Provider "${context.provider}" succeeded in ${context.latencyMs}ms`);
    }
  }, { pluginId, priority: 50 });
}
