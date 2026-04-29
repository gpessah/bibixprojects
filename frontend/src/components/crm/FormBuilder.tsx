import { useState } from 'react';
import {
  Plus, Trash2, ExternalLink, Copy, ToggleLeft, ToggleRight, Pencil,
  X, Check, Code2, Download, EyeOff, Eye, Link2, BookOpen,
} from 'lucide-react';
import { useCRMStore, type CRMForm, type CRMField, type HiddenField } from '../../store/crmStore';
import toast from 'react-hot-toast';
import IntegrationGuide from './IntegrationGuide';

const PUBLIC_BASE = window.location.origin;
const API_BASE = window.location.origin + '/api';

// ── Embed code generator ──────────────────────────────────────────────────────

function generateEmbedCode(form: CRMForm, fields: CRMField[]): string {
  const visibleFields = form.fields
    .map(key => fields.find(f => f.field_key === key))
    .filter(Boolean) as CRMField[];
  const hiddenFields: HiddenField[] = form.settings.hidden_fields ?? [];

  const fieldsJson = JSON.stringify(visibleFields.map(f => ({
    key: f.field_key,
    label: f.name,
    type: f.type,
    required: f.required,
    options: f.options,
  })), null, 2);

  const hiddenJson = hiddenFields.length > 0
    ? hiddenFields.map(h => `    ${JSON.stringify(h.field_key)}: ${JSON.stringify(h.url_param)}`).join(',\n')
    : '';

  const btnText = form.settings.button_text || 'Submit';
  const successMsg = form.settings.success_message || 'Thank you! We\'ll be in touch soon.';
  const fid = form.id;

  return `<!-- ═══════════════════════════════════════════════════════════════
     Bibix CRM Form: ${form.name}
     Generated: ${new Date().toLocaleDateString()}
     ═══════════════════════════════════════════════════════════════

  INSTRUCTIONS:
  1. Paste the <div> tag where you want the form to appear.
  2. Paste the <script> tag just before </body>.
  3. Customize the CSS section inside the script to match your design.
──────────────────────────────────────────────────────────────── -->

<!-- Step 1: Place this where you want the form -->
<div id="bf-${fid}"></div>

<!-- Step 2: Place this before </body> -->
<script>
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var FORM_ID   = '${fid}';
  var API_URL   = '${API_BASE}/crm/forms/${fid}/submit';
  var BTN_TEXT  = '${btnText}';
  var SUCCESS   = '${successMsg}';
${hiddenFields.length > 0 ? `
  // Hidden fields: auto-populated from URL params
  // e.g. ?utm_campaign=summer → field "utm_campaign" is filled silently
  var HIDDEN_FIELDS = {
${hiddenJson}
  };` : '  var HIDDEN_FIELDS = {};'}

  // ── Field definitions ─────────────────────────────────────────────────────
  var FIELDS = ${fieldsJson};

  // ── CSS — customize freely ────────────────────────────────────────────────
  var CSS = [
    '#bf-${fid}{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:480px;margin:0 auto;padding:0}',
    '#bf-${fid} .bf-title{font-size:1.5rem;font-weight:700;margin-bottom:.4rem;color:#111}',
    '#bf-${fid} .bf-desc{color:#666;margin-bottom:1.5rem;font-size:.95rem}',
    '#bf-${fid} .bf-field{margin-bottom:1rem}',
    '#bf-${fid} label{display:block;font-size:.82rem;font-weight:600;color:#333;margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.03em}',
    '#bf-${fid} input,#bf-${fid} select,#bf-${fid} textarea{width:100%;padding:.65rem 1rem;border:1.5px solid #ddd;border-radius:8px;font-size:.95rem;box-sizing:border-box;transition:border-color .2s;background:#fff}',
    '#bf-${fid} input:focus,#bf-${fid} select:focus,#bf-${fid} textarea:focus{outline:none;border-color:#0073ea;box-shadow:0 0 0 3px rgba(0,115,234,.1)}',
    '#bf-${fid} .bf-submit{width:100%;padding:.8rem;background:#0073ea;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:.5rem;transition:background .2s,transform .1s}',
    '#bf-${fid} .bf-submit:hover{background:#005ec9}',
    '#bf-${fid} .bf-submit:active{transform:scale(.98)}',
    '#bf-${fid} .bf-submit:disabled{opacity:.6;cursor:not-allowed}',
    '#bf-${fid} .bf-success{color:#037f4c;background:#e8f9f0;border-radius:8px;padding:1.2rem;text-align:center;font-weight:500;display:none}',
    '#bf-${fid} .bf-error{color:#c4384b;background:#fde8eb;border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;font-size:.9rem;display:none}',
  ].join('');

  // ── Build DOM ─────────────────────────────────────────────────────────────
  var container = document.getElementById('bf-' + FORM_ID);
  if (!container) return;

  var s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);

  var urlParams = new URLSearchParams(window.location.search);
  var hiddenVals = {};
  Object.keys(HIDDEN_FIELDS).forEach(function (fk) {
    hiddenVals[fk] = urlParams.get(HIDDEN_FIELDS[fk]) || '';
  });

  function buildField(f) {
    var eid = 'bf-' + FORM_ID + '-' + f.key;
    var req = f.required ? ' *' : '';
    var out = '<div class="bf-field">';
    out += '<label for="' + eid + '">' + f.label + req + '</label>';
    if (f.type === 'select') {
      out += '<select id="' + eid + '" name="' + f.key + '"' + (f.required ? ' required' : '') + '>';
      out += '<option value="">— Select —</option>';
      (f.options || []).forEach(function (o) { out += '<option value="' + o + '">' + o + '</option>'; });
      out += '</select>';
    } else if (f.type === 'textarea') {
      out += '<textarea id="' + eid + '" name="' + f.key + '" rows="3"' + (f.required ? ' required' : '') + '></textarea>';
    } else {
      var t = f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
      out += '<input type="' + t + '" id="' + eid + '" name="' + f.key + '"' + (f.required ? ' required' : '') + '>';
    }
    return out + '</div>';
  }

  var html = '';
  ${form.name ? `html += '<div class="bf-title">${form.name}</div>';` : ''}
  ${form.description ? `html += '<div class="bf-desc">${form.description}</div>';` : ''}
  FIELDS.forEach(function (f) { html += buildField(f); });
  html += '<button type="submit" class="bf-submit">' + BTN_TEXT + '</button>';
  html += '<div class="bf-success">' + SUCCESS + '</div>';
  html += '<div class="bf-error"></div>';

  var form = document.createElement('form');
  form.innerHTML = html;
  container.appendChild(form);

  // ── Submit handler ────────────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn    = form.querySelector('.bf-submit');
    var errDiv = form.querySelector('.bf-error');
    var okDiv  = form.querySelector('.bf-success');

    btn.disabled    = true;
    btn.textContent = 'Sending…';
    errDiv.style.display = 'none';

    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    Object.keys(hiddenVals).forEach(function (k) { if (hiddenVals[k]) data[k] = hiddenVals[k]; });

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: data }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success) throw new Error(res.error || 'Submission failed');
        form.style.display = 'none';
        okDiv.style.display = 'block';
        if (res.redirect_url) setTimeout(function () { window.location.href = res.redirect_url; }, 1800);
      })
      .catch(function (err) {
        errDiv.textContent = err.message || 'Something went wrong. Please try again.';
        errDiv.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = BTN_TEXT;
      });
  });
})();
<\/script>`;
}

// ── Embed Code Modal ──────────────────────────────────────────────────────────

function EmbedCodeModal({ form, fields, onClose }: { form: CRMForm; fields: CRMField[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = generateEmbedCode(form, fields);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bibix-form-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Code2 size={17} className="text-monday-blue" /> Embed Code — {form.name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Paste this snippet into any landing page. Customize the CSS section freely.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <pre className="h-full overflow-auto bg-gray-950 text-gray-100 rounded-xl p-4 text-xs leading-relaxed font-mono select-all">
            {code}
          </pre>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div className="text-xs text-gray-400">
            🔗 API endpoint: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{API_BASE}/crm/forms/{form.id}/submit</code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              {copied ? <><Check size={14} className="text-green-500" /> Copied!</> : <><Copy size={14} /> Copy Code</>}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600"
            >
              <Download size={14} /> Download .html
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Form Editor Modal ─────────────────────────────────────────────────────────

interface HiddenFieldRow { field_key: string; url_param: string }

function FormEditorModal({ form, onClose }: { form?: CRMForm | null; onClose: () => void }) {
  const { fields, createForm, updateForm } = useCRMStore();
  const [name, setName] = useState(form?.name ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(form?.fields ?? []);
  const [hiddenFields, setHiddenFields] = useState<HiddenFieldRow[]>(form?.settings.hidden_fields ?? []);
  const [successMsg, setSuccessMsg] = useState(form?.settings.success_message ?? "Thank you! We'll be in touch.");
  const [redirectUrl, setRedirectUrl] = useState(form?.settings.redirect_url ?? '');
  const [btnText, setBtnText] = useState(form?.settings.button_text ?? 'Submit');
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'visible' | 'hidden' | 'settings'>('visible');
  const isEdit = !!form;

  const toggleVisible = (key: string) => {
    // Can't be both visible and hidden
    if (hiddenFields.some(h => h.field_key === key)) {
      setHiddenFields(prev => prev.filter(h => h.field_key !== key));
    }
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const addHiddenField = () => {
    setHiddenFields(prev => [...prev, { field_key: '', url_param: '' }]);
  };

  const updateHiddenField = (idx: number, partial: Partial<HiddenFieldRow>) => {
    setHiddenFields(prev => prev.map((h, i) => i === idx ? { ...h, ...partial } : h));
    // Remove from visible if now hidden
    if (partial.field_key) {
      setSelectedKeys(prev => prev.filter(k => k !== partial.field_key));
    }
  };

  const removeHiddenField = (idx: number) => {
    setHiddenFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Form name required'); return; }
    if (selectedKeys.length === 0) { toast.error('Select at least one visible field'); return; }
    setSaving(true);
    try {
      const cleanHidden = hiddenFields.filter(h => h.field_key && h.url_param);
      const payload = {
        name: name.trim(), description,
        fields: selectedKeys,
        settings: {
          success_message: successMsg,
          redirect_url: redirectUrl,
          button_text: btnText,
          hidden_fields: cleanHidden,
        },
      };
      if (isEdit) { await updateForm(form!.id, payload); toast.success('Form updated'); }
      else        { await createForm(payload);           toast.success('Form created'); }
      onClose();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  // Determine which fields are available for hidden (not already visible)
  const usedKeys = new Set([...selectedKeys, ...hiddenFields.map(h => h.field_key)]);

  const sectionBtn = (id: typeof activeSection, label: string, count?: number) => (
    <button
      onClick={() => setActiveSection(id)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        activeSection === id ? 'bg-monday-blue text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Form' : 'New Form'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name & description */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Form Name *</label>
              <input
                value={name} onChange={e => setName(e.target.value)} autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                placeholder="e.g. Lead Capture, Contact Us…"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
              <input
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                placeholder="Short subtitle shown on the form"
              />
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {sectionBtn('visible', '👁 Visible Fields', selectedKeys.length)}
            {sectionBtn('hidden', '🔗 Hidden (URL Params)', hiddenFields.filter(h => h.field_key && h.url_param).length)}
            {sectionBtn('settings', '⚙️ Settings')}
          </div>

          {/* Visible fields */}
          {activeSection === 'visible' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">These fields are shown to the user in the form.</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {fields.map(f => {
                  const isHidden = hiddenFields.some(h => h.field_key === f.field_key);
                  const on = selectedKeys.includes(f.field_key);
                  return (
                    <label key={f.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isHidden ? 'bg-orange-50 opacity-60' : 'hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={isHidden}
                        onChange={() => toggleVisible(f.field_key)}
                        className="w-4 h-4 rounded text-monday-blue"
                      />
                      <span className="text-sm text-gray-700 flex-1">{f.name}</span>
                      <span className="text-xs text-gray-400">{f.field_group}</span>
                      {isHidden && <span className="text-xs text-orange-500 font-medium flex items-center gap-1"><EyeOff size={11} /> hidden</span>}
                      {f.required && !isHidden && <span className="text-xs text-red-400 font-medium">required</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hidden fields */}
          {activeSection === 'hidden' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                Hidden fields are <strong>not shown</strong> to the user. Their values are read automatically from the URL. <br />
                Example: a visitor from <code className="bg-gray-100 px-1 rounded">?utm_campaign=summer&aff=partner1</code> will have those values captured silently.
              </p>
              <div className="space-y-2">
                {hiddenFields.length === 0 && (
                  <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                    No hidden fields yet. Add one below.
                  </div>
                )}
                {hiddenFields.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                    <EyeOff size={14} className="text-gray-400 flex-shrink-0" />
                    <select
                      value={h.field_key}
                      onChange={e => updateHiddenField(idx, { field_key: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                    >
                      <option value="">— CRM Field —</option>
                      {fields
                        .filter(f => f.field_key === h.field_key || !selectedKeys.includes(f.field_key))
                        .map(f => <option key={f.id} value={f.field_key}>{f.name} ({f.field_group})</option>)}
                    </select>
                    <span className="text-gray-400 flex-shrink-0">←</span>
                    <div className="flex items-center gap-1 flex-1 border border-gray-200 rounded-lg bg-white px-2 py-1.5">
                      <Link2 size={12} className="text-gray-400 flex-shrink-0" />
                      <input
                        value={h.url_param}
                        onChange={e => updateHiddenField(idx, { url_param: e.target.value })}
                        placeholder="URL param name (e.g. utm_campaign)"
                        className="flex-1 text-sm focus:outline-none bg-transparent"
                      />
                    </div>
                    <button onClick={() => removeHiddenField(idx)} className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addHiddenField}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-monday-blue border border-dashed border-monday-blue/40 rounded-xl hover:bg-blue-50"
                >
                  <Plus size={14} /> Add Hidden Field
                </button>
              </div>
            </div>
          )}

          {/* Settings */}
          {activeSection === 'settings' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Button Text</label>
                  <input value={btnText} onChange={e => setBtnText(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Redirect URL (optional)</label>
                  <input value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Success Message</label>
                <input value={successMsg} onChange={e => setSuccessMsg(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Form'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main FormBuilder ───────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { forms, fields, deleteForm, updateForm } = useCRMStore();
  const [editForm, setEditForm] = useState<CRMForm | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [embedForm, setEmbedForm] = useState<CRMForm | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleDelete = async (f: CRMForm) => {
    if (!confirm(`Delete form "${f.name}"?`)) return;
    try { await deleteForm(f.id); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  const toggleActive = async (f: CRMForm) => {
    try { await updateForm(f.id, { active: !f.active }); }
    catch { toast.error('Failed'); }
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${PUBLIC_BASE}/form/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Link copied');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Forms</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Create embeddable forms for your landing pages. Download the code and customize the styles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <BookOpen size={15} /> Integration Guide
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-monday-blue text-white text-sm rounded-lg hover:bg-blue-600">
            <Plus size={15} /> New Form
          </button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <div className="text-sm font-medium">No forms yet</div>
          <div className="text-xs mt-1 mb-4">Create a form to embed on your landing pages</div>
          <button onClick={() => setShowNew(true)} className="text-monday-blue text-sm hover:underline">Create your first form</button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map(form => {
            const url = `${PUBLIC_BASE}/form/${form.id}`;
            const hiddenCount = (form.settings.hidden_fields ?? []).filter(h => h.field_key && h.url_param).length;
            return (
              <div key={form.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-800 text-sm">{form.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${form.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {form.active ? 'Active' : 'Inactive'}
                      </span>
                      {hiddenCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-600 flex items-center gap-1">
                          <EyeOff size={10} /> {hiddenCount} hidden
                        </span>
                      )}
                    </div>
                    {form.description && <p className="text-xs text-gray-500 mt-0.5">{form.description}</p>}
                    <div className="text-xs text-gray-400 font-mono mt-1.5 truncate">{url}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.fields.map(k => {
                        const f = fields.find(fi => fi.field_key === k);
                        return (
                          <span key={k} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                            <Eye size={9} className="inline mr-0.5" />{f?.name ?? k}
                          </span>
                        );
                      })}
                      {(form.settings.hidden_fields ?? []).filter(h => h.field_key).map(h => {
                        const f = fields.find(fi => fi.field_key === h.field_key);
                        return (
                          <span key={h.field_key} className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-xs font-medium">
                            <EyeOff size={9} className="inline mr-0.5" />{f?.name ?? h.field_key} ← ?{h.url_param}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleActive(form)} title={form.active ? 'Deactivate' : 'Activate'}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                      {form.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => setEmbedForm(form)} title="Get embed code"
                      className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-monday-blue">
                      <Code2 size={15} />
                    </button>
                    <button onClick={() => copyLink(form.id)} title="Copy link"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      {copiedId === form.id ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                    </button>
                    <a href={url} target="_blank" rel="noopener" title="Open form"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      <ExternalLink size={15} />
                    </a>
                    <button onClick={() => setEditForm(form)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(form)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew   && <FormEditorModal onClose={() => setShowNew(false)} />}
      {editForm  && <FormEditorModal form={editForm} onClose={() => setEditForm(null)} />}
      {embedForm && <EmbedCodeModal form={embedForm} fields={fields} onClose={() => setEmbedForm(null)} />}
      {showGuide && <IntegrationGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
