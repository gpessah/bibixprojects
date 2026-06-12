// Mobile-first PWA page for creating and monitoring Instagram action batches.
//
// Designed from the ground up for narrow viewports (360-480px). Layout is a
// vertical stack with full-width inputs, large tap targets (min 44px), and
// no desktop chrome (no sidebar, no tabs, no hover states). Lives at /m so
// users can "Add to Home Screen" and get a near-native experience.
//
// Three sections, top to bottom:
//   1. Compact header — app title + account picker + logout
//   2. Create Batch form — single screen: account, action, count, URLs, send
//   3. Recent Batches list — last 10, tap to expand, retry buttons on failures

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';

type Status =
  | 'draft' | 'pending' | 'running' | 'paused' | 'completed'
  | 'cancelled' | 'failed' | 'partial' | 'no_targets' | 'claimed';

interface Item {
  id: string;
  post_url: string;
  action_type: string;
  count_done: number;
  count_requested: number;
  status: Status;
  error_message?: string | null;
}

interface Campaign {
  id: string;
  name?: string | null;
  as_account: string;
  status: Status;
  total_completed: number;
  total_requested: number;
  items_count?: number;
  created_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-700',
  pending:    'bg-amber-100 text-amber-800',
  claimed:    'bg-blue-100 text-blue-700',
  running:    'bg-blue-100 text-blue-700',
  paused:     'bg-orange-100 text-orange-800',
  completed:  'bg-green-100 text-green-800',
  partial:    'bg-orange-100 text-orange-800',
  no_targets: 'bg-yellow-100 text-yellow-800',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-gray-200 text-gray-700',
};

function parsePostUrls(text: string): string[] {
  const lines = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/(?:^|\/)(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (m) out.push(`https://www.instagram.com/p/${m[1]}/`);
  }
  return [...new Set(out)];
}

export default function MobileBatches() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [igAccounts, setIgAccounts] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, Item[]>>({});

  // Quick batch form state
  const [account, setAccount] = useState('');
  const [actionType, setActionType] = useState<'like' | 'reply' | 'follow'>('like');
  const [count, setCount] = useState('100');
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [debug, setDebug] = useState<string>('mounted');

  // Mark mount in console + on-screen so we can SEE the page reached the
  // render path even if subsequent steps fail.
  useEffect(() => {
    console.log('[MobileBatches] mounted, user=', user?.email, 'token=', localStorage.getItem('token') ? 'yes' : 'no');
    setDebug(d => d + ' → useEffect-mount');
  }, []);

  // Bounce to login if unauthenticated. The mobile route is protected at the
  // App level too, but doing it here gives a faster user-visible redirect.
  useEffect(() => {
    if (user === null && !localStorage.getItem('token')) {
      console.log('[MobileBatches] no user + no token → /login');
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  // Initial load: accounts + recent batches (10 latest)
  useEffect(() => {
    setDebug(d => d + ' → loading');
    api.get('/instagram/accounts').then((r: { data: unknown }) => {
      const list = Array.isArray(r.data) ? (r.data as string[]) : [];
      setIgAccounts(list);
      if (list.length && !account) setAccount(list[0]);
      setDebug(d => d + ` → accounts=${list.length}`);
    }).catch((e) => {
      console.error('[MobileBatches] /accounts failed:', e);
      setDebug(d => d + ` → accounts ERR ${e?.message || '?'}`);
    });
    refreshCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCampaigns() {
    try {
      const r = await api.get('/instagram/action-campaigns?limit=10');
      const rows = Array.isArray(r.data) ? r.data : (r.data?.rows ?? []);
      setCampaigns(rows);
    } catch {
      setToast({ kind: 'error', text: 'Failed to load batches' });
    }
  }

  async function expandCampaign(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!expandedItems[id]) {
      try {
        const r = await api.get(`/instagram/action-campaigns/${id}/items`);
        setExpandedItems(prev => ({ ...prev, [id]: r.data || [] }));
      } catch { /* leave undefined, retry on next expand */ }
    }
  }

  async function submit() {
    if (!account) { setToast({ kind: 'error', text: 'Pick an account first.' }); return; }
    const parsedUrls = parsePostUrls(urls);
    if (parsedUrls.length === 0) { setToast({ kind: 'error', text: 'Paste at least one IG post URL.' }); return; }
    if (parsedUrls.length > 20) { setToast({ kind: 'error', text: `Max 20 posts — you have ${parsedUrls.length}.` }); return; }
    const c = Math.max(1, Math.min(800, parseInt(count, 10) || 0));
    if (c === 0) { setToast({ kind: 'error', text: 'Count must be ≥ 1.' }); return; }

    setBusy(true);
    setToast(null);
    try {
      const camp = await api.post(`/instagram/action-campaigns`, {
        as_account: account,
        concurrency: 6,
        free_text: `mobile · ${parsedUrls.length} × ${c} ${actionType}`,
        start_at: null,
      });
      const campaignId = camp.data?.id;
      if (!campaignId) throw new Error('Backend did not return a campaign id.');
      for (const url of parsedUrls) {
        await api.post(`/instagram/action-campaigns/${campaignId}/items`, {
          post_url: url, action_type: actionType, count: c,
        });
      }
      await api.post(`/instagram/action-campaigns/${campaignId}/send`);
      setUrls('');
      setToast({ kind: 'success', text: `Sent ${parsedUrls.length} post${parsedUrls.length === 1 ? '' : 's'} — extension picks it up in ~60s.` });
      await refreshCampaigns();
    } catch (e: unknown) {
      const msg = e as { response?: { data?: { error?: string } } };
      setToast({ kind: 'error', text: msg.response?.data?.error || (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function retryItem(campaignId: string, itemId: string) {
    try {
      await api.post(`/instagram/action-queue/${itemId}/retry`);
      // Reload that campaign's items
      const r = await api.get(`/instagram/action-campaigns/${campaignId}/items`);
      setExpandedItems(prev => ({ ...prev, [campaignId]: r.data || [] }));
      setToast({ kind: 'success', text: 'Retry queued — extension picks it up shortly.' });
      await refreshCampaigns();
    } catch (e: unknown) {
      const msg = e as { response?: { data?: { error?: string } } };
      setToast({ kind: 'error', text: 'Retry failed: ' + (msg.response?.data?.error || 'unknown') });
    }
  }

  const parsedCount = useMemo(() => parsePostUrls(urls).length, [urls]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12" style={{ paddingTop: 'env(safe-area-inset-top)' }}>

      {/* TEMP DEBUG BANNER — confirms the page reached the render path.
          Remove once the white-screen issue is identified. */}
      <div style={{ background: '#fef3c7', color: '#92400e', padding: '6px 12px', fontSize: 11, fontFamily: 'monospace' }}>
        DEBUG: {debug} · user={user?.email || 'none'} · token={localStorage.getItem('token') ? 'yes' : 'no'}
      </div>

      {/* ───── Header ───── */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">Bibix · IG Batches</h1>
          <p className="text-[11px] text-gray-500">{user?.email}</p>
        </div>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-xs text-gray-500 active:text-gray-800 px-2 py-1">Log out</button>
      </header>

      {/* ───── Toast ───── */}
      {toast && (
        <div className={`mx-4 mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
          toast.kind === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`} onClick={() => setToast(null)}>
          <span className="flex-1">{toast.text}</span>
          <button className="text-current opacity-60">✕</button>
        </div>
      )}

      {/* ───── Create form ───── */}
      <section className="bg-white mt-3 mx-3 rounded-xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">New batch</h2>

        {/* Account */}
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Account</label>
        <select value={account} onChange={e => setAccount(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base bg-white mb-3">
          {igAccounts.length === 0 && <option value="">— no accounts configured —</option>}
          {igAccounts.map(u => <option key={u} value={u}>@{u}</option>)}
        </select>

        {/* Action type */}
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Action</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(['like', 'reply', 'follow'] as const).map(at => (
            <button key={at} onClick={() => setActionType(at)}
              className={`py-3 rounded-lg text-sm font-medium border-2 active:scale-95 transition ${
                actionType === at
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200'
              }`}>
              {at === 'like' ? '❤️ Like' : at === 'reply' ? '💬 Reply' : '👤 Follow'}
            </button>
          ))}
        </div>

        {/* Count */}
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
          {actionType === 'follow' ? 'Follow count' : 'Per post'}
        </label>
        <input type="number" inputMode="numeric" min={1} max={800}
          value={count} onChange={e => setCount(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base bg-white mb-3" />

        {/* URLs */}
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
          Post URLs <span className="text-gray-400 normal-case tracking-normal">(one per line, max 20)</span>
        </label>
        <textarea rows={4} value={urls} onChange={e => setUrls(e.target.value)}
          placeholder={'https://www.instagram.com/p/SHORTCODE/'}
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm bg-white font-mono mb-1" />
        {urls.trim() && (
          <p className={`text-[11px] mb-3 ${parsedCount === 0 ? 'text-red-600' : 'text-gray-500'}`}>
            <b>{parsedCount}</b> valid post URL{parsedCount === 1 ? '' : 's'} detected
          </p>
        )}
        {!urls.trim() && <div className="h-2" />}

        {/* Submit */}
        <button onClick={submit} disabled={busy}
          className="w-full py-4 bg-blue-600 active:bg-blue-800 text-white rounded-lg font-semibold text-base disabled:opacity-50">
          {busy ? 'Sending…' : parsedCount > 0
              ? `Send ${parsedCount} × ${count} ${actionType}`
              : 'Send batch'}
        </button>
      </section>

      {/* ───── Recent batches ───── */}
      <section className="mt-4 mx-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Recent batches</h2>
          <button onClick={refreshCampaigns} className="text-xs text-blue-600 active:text-blue-800 px-2 py-1">Refresh</button>
        </div>

        {campaigns.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8 bg-white rounded-xl border border-gray-100">
            No batches yet. Create one above ↑
          </p>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => {
              const pct = c.total_requested > 0 ? Math.round((c.total_completed / c.total_requested) * 100) : 0;
              const items = expandedItems[c.id] || [];
              const isExpanded = expandedId === c.id;
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button onClick={() => expandCampaign(c.id)} className="w-full text-left p-3 active:bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">@{c.as_account}</span>
                      <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_COLOR[c.status] || 'bg-gray-100 text-gray-700'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mb-1.5">
                      {c.total_completed.toLocaleString()} / {c.total_requested.toLocaleString()} actions
                      {(c.items_count ?? 0) > 0 && <> · {c.items_count} post{c.items_count === 1 ? '' : 's'}</>}
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        c.status === 'completed' ? 'bg-green-500' :
                        c.status === 'failed' || c.status === 'cancelled' ? 'bg-red-400' :
                        c.status === 'partial' ? 'bg-orange-400' : 'bg-blue-500'
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5">
                      {items.length === 0 && <p className="text-[11px] text-gray-400 py-1">Loading items…</p>}
                      {items.map(it => {
                        const shortcode = it.post_url.match(/(?:p|reel)\/([\w-]+)/)?.[1] || it.post_url.slice(-12);
                        const retryable = ['failed', 'partial', 'no_targets', 'cancelled'].includes(it.status);
                        return (
                          <div key={it.id} className="flex items-center gap-2 py-1.5">
                            <a href={it.post_url} target="_blank" rel="noreferrer"
                               className="text-blue-600 active:underline text-xs flex-1 truncate font-mono">
                              {shortcode}
                            </a>
                            <span className="text-[11px] text-gray-600 tabular-nums">
                              {it.count_done}/{it.count_requested}
                            </span>
                            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOR[it.status] || 'bg-gray-100'}`}>
                              {it.status}
                            </span>
                            {retryable && (
                              <button onClick={() => retryItem(c.id, it.id)}
                                className="text-[11px] px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded active:bg-blue-100">
                                ↻
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {items.some(i => i.error_message) && (
                        <div className="border-t border-gray-200 mt-1 pt-1.5 space-y-0.5">
                          {items.filter(i => i.error_message).map(i => (
                            <p key={i.id} className="text-[10px] text-red-600 leading-tight">⚠ {i.error_message}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom-anchored link back to the full desktop UI for power users */}
      <p className="text-center text-[11px] text-gray-400 mt-6">
        <a href="/marketing/instagram" className="underline">Open desktop view</a>
      </p>
    </div>
  );
}
