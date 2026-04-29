import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, ToggleLeft, ToggleRight, Loader2, Eye, EyeOff } from 'lucide-react';
import { useCRMStore, type CRMApiKey } from '../../store/crmStore';
import toast from 'react-hot-toast';

// ── Create Key Modal ──────────────────────────────────────────────────────────

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const { createApiKey } = useCRMStore();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CRMApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Enter a name for this key'); return; }
    setSaving(true);
    try {
      const key = await createApiKey(name.trim());
      setCreated(key);
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setSaving(false);
    }
  };

  const copy = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.api_key_full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {created ? 'API Key Created' : 'Create API Key'}
          </h2>
        </div>

        <div className="px-6 py-5">
          {!created ? (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                Key Name
              </label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Landing Page A, Partner Portal…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <strong>Copy this key now.</strong> For security, it won't be shown again.
              </div>
              <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-4 py-3">
                <code className="flex-1 text-green-400 text-sm font-mono break-all">
                  {created.api_key_full}
                </code>
                <button
                  onClick={copy}
                  className="shrink-0 p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700"
                >
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          {!created ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Creating…' : 'Create Key'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Key Row ───────────────────────────────────────────────────────────────────

function KeyRow({ apiKey }: { apiKey: CRMApiKey }) {
  const { deleteApiKey, toggleApiKey } = useCRMStore();
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete API key "${apiKey.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteApiKey(apiKey.id);
      toast.success('API key deleted');
    } catch {
      toast.error('Failed to delete');
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleApiKey(apiKey.id, !apiKey.active);
    } catch {
      toast.error('Failed to update');
    } finally {
      setToggling(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(apiKey.api_key_full);
    toast.success('Key copied');
  };

  return (
    <div className={`flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 ${!apiKey.active ? 'opacity-50' : ''}`}>
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <Key size={16} className="text-gray-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{apiKey.name}</span>
          {!apiKey.active && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Revoked</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <code className="text-xs text-gray-500 font-mono">
            {showFull ? apiKey.api_key_full : apiKey.api_key_masked}
          </code>
          <button
            onClick={() => setShowFull(v => !v)}
            className="text-gray-400 hover:text-gray-600"
          >
            {showFull ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button onClick={copy} className="text-gray-400 hover:text-gray-600">
            <Copy size={12} />
          </button>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span>Created {new Date(apiKey.created_at).toLocaleDateString()}</span>
          {apiKey.last_used_at && (
            <span>· Last used {new Date(apiKey.last_used_at).toLocaleDateString()}</span>
          )}
          {!apiKey.last_used_at && <span>· Never used</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={apiKey.active ? 'Revoke key' : 'Activate key'}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
        >
          {apiKey.active
            ? <ToggleRight size={22} className="text-green-500" />
            : <ToggleLeft size={22} />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40"
        >
          {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── Docs Section ──────────────────────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-600 transition-opacity"
      >
        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

const CURL_EXAMPLE = `curl -X POST https://your-domain.com/api/crm/ingest \\
  -H "Authorization: Bearer bx_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@example.com",
    "phone": "+1 555 000 1234",
    "country": "United States",
    "utm_campaign": "summer_promo",
    "utm_source": "google",
    "referrer": "https://example.com"
  }'`;

const JS_EXAMPLE = `const response = await fetch('https://your-domain.com/api/crm/ingest', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer bx_your_api_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    phone: '+1 555 000 1234',
    utm_campaign: 'summer_promo',
    utm_source: 'google',
  }),
});

const data = await response.json();
// { success: true, contact_id: "abc123" }`;

const RESPONSE_EXAMPLE = `// Success (200)
{ "success": true, "contact_id": "d4f8a2b1-..." }

// Error (401)
{ "error": "Invalid or inactive API key" }

// Error (400)
{ "error": "No fields provided" }`;

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function APIKeysPanel() {
  const { apiKeys, apiKeysLoading, loadApiKeys } = useCRMStore();
  const [showCreate, setShowCreate] = useState(false);
  const [docsTab, setDocsTab] = useState<'curl' | 'js' | 'response'>('curl');

  useEffect(() => { loadApiKeys(); }, [loadApiKeys]);

  return (
    <div className="space-y-6">
      {/* Keys card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">API Keys</h3>
            <p className="text-xs text-gray-500 mt-0.5">Use these keys to send leads from external sources</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            New Key
          </button>
        </div>

        {apiKeysLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading…
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No API keys yet. Create one to start ingesting leads.
          </div>
        ) : (
          <div>
            {apiKeys.map(k => <KeyRow key={k.id} apiKey={k} />)}
          </div>
        )}
      </div>

      {/* Docs card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Integration Guide</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Send a <code className="bg-gray-100 px-1 rounded">POST</code> request to ingest a lead into the CRM
          </p>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Endpoint */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Endpoint</p>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">POST</span>
              <code className="text-sm text-gray-700">/api/crm/ingest</code>
            </div>
          </div>

          {/* Auth */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Authentication</p>
            <p className="text-sm text-gray-600 mb-2">
              Pass your API key using any of these methods:
            </p>
            <ul className="space-y-1 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>HTTP header: <code className="bg-gray-100 px-1 rounded text-xs">Authorization: Bearer bx_…</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>HTTP header: <code className="bg-gray-100 px-1 rounded text-xs">X-Api-Key: bx_…</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>Request body: <code className="bg-gray-100 px-1 rounded text-xs">{`{ "api_key": "bx_…", ... }`}</code></span>
              </li>
            </ul>
          </div>

          {/* Fields */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Request Body</p>
            <p className="text-sm text-gray-600 mb-2">
              Send any CRM field keys at the top level or nested under a <code className="bg-gray-100 px-1 rounded text-xs">values</code> object:
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-gray-500 bg-gray-50 rounded-xl p-4">
              {[
                'first_name', 'last_name', 'email', 'phone',
                'country', 'language', 'utm_campaign', 'utm_source',
                'utm_medium', 'utm_content', 'utm_term', 'referrer',
                'affiliate', 'referring_affiliate', 'marketing_link',
                'cellxpert_cxd',
              ].map(f => (
                <span key={f}>{f}</span>
              ))}
              <span className="text-gray-400 col-span-2 mt-1">… and any other field keys</span>
            </div>
          </div>

          {/* Examples */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              {(['curl', 'js', 'response'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDocsTab(t)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    docsTab === t
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {t === 'curl' ? 'cURL' : t === 'js' ? 'JavaScript' : 'Response'}
                </button>
              ))}
            </div>
            <CodeBlock code={docsTab === 'curl' ? CURL_EXAMPLE : docsTab === 'js' ? JS_EXAMPLE : RESPONSE_EXAMPLE} />
          </div>

          {/* Security note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Security tip:</strong> Never expose your API key in client-side JavaScript. Use server-side code or a proxy to keep your key private.
          </div>
        </div>
      </div>

      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
