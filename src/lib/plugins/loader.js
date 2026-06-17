// src/lib/plugins/loader.js
// This module MUST run server-side only (uses dynamic fs imports).
// It is excluded from webpack bundling via next.config.mjs externals.
import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { registerHook, clearHooks } from './hooks.js';

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const loadedPlugins = new Map(); // id -> { manifest, status }

export async function loadPlugins() {
  let entries;
  try {
    entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  } catch {
    return []; // No plugins directory — that's fine
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(PLUGINS_DIR, entry.name);
    try {
      const manifest = await loadManifest(pluginDir);
      if (!manifest.enabled) {
        results.push({ id: manifest.id || entry.name, status: 'disabled' });
        continue;
      }
      const mainFile = join(pluginDir, manifest.main || 'index.js');
      const plugin = await import(/* webpackIgnore: true */ mainFile);
      if (typeof plugin.register === 'function') {
        await plugin.register({ registerHook, pluginId: manifest.id });
      }
      loadedPlugins.set(manifest.id, { manifest, status: 'loaded' });
      results.push({ id: manifest.id, name: manifest.name, version: manifest.version, status: 'loaded' });
    } catch (err) {
      const id = entry.name;
      loadedPlugins.set(id, { manifest: { id }, status: 'error', error: err.message });
      results.push({ id, status: 'error', error: err.message });
      console.warn(`[PluginLoader] Failed to load plugin "${id}":`, err.message);
    }
  }
  return results;
}

async function loadManifest(dir) {
  const raw = await readFile(join(dir, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(raw);
  if (!manifest.id) throw new Error('manifest.json missing required "id" field');
  return manifest;
}

export function getLoadedPlugins() {
  return [...loadedPlugins.entries()].map(([id, { manifest, status, error }]) => ({
    id,
    name: manifest.name || id,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    status,
    error: error || null
  }));
}

export async function unloadPlugins() {
  clearHooks();
  loadedPlugins.clear();
}
