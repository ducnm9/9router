'use client';
import { useState, useEffect, useCallback } from 'react';
import Card from '@/shared/components/Card.js';

const CATEGORIES = ['general', 'coding', 'writing', 'analysis', 'custom'];

// Detect {{variable}} patterns in template content
function extractVariables(content) {
  if (!content) return [];
  const matches = content.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
}

// Interpolate {{variable}} in content with values
function interpolate(content, values) {
  if (!content) return '';
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`);
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'general', content: '' });
  const [varValues, setVarValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/templates');
      if (res.status === 401) { setError('Authentication required'); return; }
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Apply category filter
  useEffect(() => {
    setFiltered(activeCategory === 'all'
      ? templates
      : templates.filter(t => t.category === activeCategory));
  }, [templates, activeCategory]);

  const categories = ['all', ...new Set(templates.map(t => t.category).filter(Boolean))];

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ name: '', category: 'general', content: '' });
    setVarValues({});
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditingTemplate(t);
    setForm({ name: t.name, category: t.category || 'general', content: t.content });
    setVarValues({});
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.content) return;
    setSaving(true);
    try {
      const url = editingTemplate ? `/api/templates/${editingTemplate.id}` : '/api/templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, variables: extractVariables(form.content) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed'); }
      setShowModal(false);
      await fetchTemplates();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchTemplates();
  };

  const handleUse = async (template) => {
    const vars = extractVariables(template.content);
    const text = vars.length > 0 ? interpolate(template.content, varValues) : template.content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-HTTPS or restricted environments
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        // Copy failed silently — still show "Copied!" for UX
      }
    }
    setCopied(template.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const detectedVars = extractVariables(form.content);
  const preview = interpolate(form.content, varValues);

  const categoryBadge = (cat) => {
    const colors = {
      coding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      writing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      analysis: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      general: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[cat] || colors.general}`}>
        {cat || 'general'}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Prompt Templates</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90"
        >
          + Create Template
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-white border-primary'
                : 'border-border hover:bg-surface-hover'
            }`}
          >
            {cat === 'all' ? `All (${templates.length})` : cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-muted text-sm">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-text-muted text-sm">
            <span className="material-symbols-outlined text-[48px] mb-2 block">article</span>
            {activeCategory === 'all' ? 'No templates yet. Create your first one!' : `No templates in "${activeCategory}".`}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <Card key={t.id} padding="sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium text-sm leading-tight">{t.name}</h3>
                {categoryBadge(t.category)}
              </div>
              <p className="text-xs text-text-muted line-clamp-2 mb-3 font-mono">{t.content}</p>
              {t.variables?.length > 0 && (
                <p className="text-xs text-text-muted mb-3">
                  Variables:{' '}
                  {t.variables.map(v => (
                    <code key={v} className="bg-surface-secondary px-1 rounded mr-1">{`{{${v}}}`}</code>
                  ))}
                </p>
              )}
              <div className="flex gap-1.5 mt-auto pt-2 border-t border-border/50">
                <button
                  onClick={() => handleUse(t)}
                  className="flex-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20"
                >
                  {copied === t.id ? 'Copied!' : 'Use'}
                </button>
                <button
                  onClick={() => openEdit(t)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-surface-hover"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="px-2 py-1 text-xs text-error border border-error/30 rounded hover:bg-error/10"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-modal-title"
            className="bg-surface rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 my-auto"
          >
            <h2 id="template-modal-title" className="text-lg font-semibold mb-4">
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="tmpl-name" className="block text-sm font-medium mb-1">Name *</label>
                <input
                  id="tmpl-name"
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="My template"
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm"
                />
              </div>
              <div>
                <label htmlFor="tmpl-category" className="block text-sm font-medium mb-1">Category</label>
                <select
                  id="tmpl-category"
                  value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tmpl-content" className="block text-sm font-medium mb-1">
                  Content *{' '}
                  <span className="text-xs text-text-muted font-normal">
                    — use {'{{'+'variable'+'}}'} for variables
                  </span>
                </label>
                <textarea
                  id="tmpl-content"
                  value={form.content}
                  onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                  rows={6}
                  placeholder="Write your prompt here. Use {{variable}} for dynamic parts."
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm font-mono resize-y"
                />
              </div>

              {detectedVars.length > 0 && (
                <div className="p-3 bg-surface-secondary rounded-lg">
                  <p className="text-xs font-medium mb-2">Variables detected — fill to preview:</p>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {detectedVars.map(v => (
                      <div key={v} className="flex items-center gap-2">
                        <code className="text-xs w-24 shrink-0">{`{{${v}}}`}</code>
                        <input
                          type="text"
                          placeholder={`Enter ${v}`}
                          value={varValues[v] || ''}
                          onChange={e => setVarValues(p => ({ ...p, [v]: e.target.value }))}
                          className="flex-1 px-2 py-1 text-xs border rounded bg-surface border-border"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-medium mb-1">Preview:</p>
                  <pre className="text-xs bg-surface p-2 rounded border border-border whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                    {preview}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.content}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
