// Mobile-first PWA page for creating and monitoring Instagram action batches.
// Designed for narrow viewports (360-480px). Lives at /m so the PWA can be
// installed via "Add to Home Screen" and run fullscreen.
//
// Re-written as a single-effect, single-state-object page to avoid React's
// invariant #426 (suspense boundary update conflict) that the previous,
// more granular version triggered under staging's Suspense + lazy() wrapper.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

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
  as_account: string;
  status: Status;
  total_completed: number;
  total_requested: number;
  items_count?: number;
}

const STATUS_COLOR: Record<string, string> = {
  draft:      '#e5e7eb', pending: '#fef3c7', claimed: '#dbeafe',
  running:    '#dbeafe', paused: '#fed7aa', completed: '#bbf7d0',
  partial:    '#fed7aa', no_targets: '#fef9c3', failed: '#fecaca',
  cancelled:  '#e5e7eb',
};

function parsePostUrls(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)) {
    const m = line.match(/(?:^|\/)(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (m) out.push(`https://www.instagram.com/p/${m[1]}/`);
  }
  return Array.from(new Set(out));
}

export default function MobileBatches() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Item[]>([]);
  const [form, setForm] = useState({
    account: '',
    actionType: 'like' as 'like' | 'reply' | 'follow',
    count: '100',
    urls: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Single mount-effect — load accounts + campaigns serially, set form
  // defaults at the end. No second useEffect means no Suspense interaction.
  useEffect(() => {
    (async () => {
      if (!localStorage.getItem('token')) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const accRes = await api.get('/instagram/accounts');
        const accList: string[] = Array.isArray(accRes.data) ? accRes.data : [];
        const campRes = await api.get('/instagram/action-campaigns?limit=10');
        const campList: Campaign[] = Array.isArray(campRes.data)
          ? campRes.data
          : (campRes.data?.rows ?? []);
        setAccounts(accList);
        setCampaigns(campList);
        if (accList.length) setForm(f => ({ ...f, account: accList[0] }));
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        if (err.response?.status === 401) { navigate('/login', { replace: true }); return; }
        setMsg({ ok: false, text: err.response?.data?.error || 'Failed to load' });
      }
    })();
  }, [navigate]);

  async function reloadCampaigns() {
    try {
      const r = await api.get('/instagram/action-campaigns?limit=10');
      const list: Campaign[] = Array.isArray(r.data) ? r.data : (r.data?.rows ?? []);
      setCampaigns(list);
    } catch { /* ignore */ }
  }

  async function expandRow(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setExpandedItems([]);
    try {
      const r = await api.get(`/instagram/action-campaigns/${id}/items`);
      setExpandedItems(Array.isArray(r.data) ? r.data : []);
    } catch { /* ignore */ }
  }

  async function send() {
    if (!form.account) { setMsg({ ok: false, text: 'Pick an account.' }); return; }
    const urls = parsePostUrls(form.urls);
    if (urls.length === 0) { setMsg({ ok: false, text: 'Paste at least 1 valid IG URL.' }); return; }
    if (urls.length > 20) { setMsg({ ok: false, text: `Max 20 posts (you have ${urls.length}).` }); return; }
    const n = Math.max(1, Math.min(800, parseInt(form.count, 10) || 0));
    if (n === 0) { setMsg({ ok: false, text: 'Count must be ≥ 1.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const camp = await api.post('/instagram/action-campaigns', {
        as_account: form.account,
        concurrency: 6,
        free_text: `mobile · ${urls.length} × ${n} ${form.actionType}`,
        start_at: null,
      });
      const cid = camp.data?.id;
      if (!cid) throw new Error('No campaign id returned');
      for (const url of urls) {
        await api.post(`/instagram/action-campaigns/${cid}/items`, {
          post_url: url, action_type: form.actionType, count: n,
        });
      }
      await api.post(`/instagram/action-campaigns/${cid}/send`);
      setForm(f => ({ ...f, urls: '' }));
      setMsg({ ok: true, text: `Sent ${urls.length} post${urls.length === 1 ? '' : 's'}.` });
      await reloadCampaigns();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setMsg({ ok: false, text: err.response?.data?.error || err.message || 'Send failed' });
    } finally {
      setBusy(false);
    }
  }

  async function retry(itemId: string) {
    try {
      await api.post(`/instagram/action-queue/${itemId}/retry`);
      if (expandedId) {
        const r = await api.get(`/instagram/action-campaigns/${expandedId}/items`);
        setExpandedItems(Array.isArray(r.data) ? r.data : []);
      }
      await reloadCampaigns();
      setMsg({ ok: true, text: 'Retry queued.' });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setMsg({ ok: false, text: 'Retry failed: ' + (err.response?.data?.error || 'unknown') });
    }
  }

  const parsedCount = parsePostUrls(form.urls).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', color: '#111827', paddingBottom: 24, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Bibix · IG Batches</h1>
        <button onClick={() => { localStorage.removeItem('token'); navigate('/login'); }} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', padding: 4 }}>Log out</button>
      </header>

      {msg && (
        <div onClick={() => setMsg(null)} style={{ margin: '12px 12px 0', padding: 12, borderRadius: 8, fontSize: 14, background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#065f46' : '#991b1b', border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* CREATE FORM */}
      <section style={{ background: '#fff', margin: '12px 12px 0', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>New batch</h2>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Account</label>
        <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '12px', fontSize: 16, background: '#fff', marginBottom: 12, boxSizing: 'border-box' }}>
          {accounts.length === 0 && <option value="">— no accounts —</option>}
          {accounts.map(a => <option key={a} value={a}>@{a}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Action</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {(['like', 'reply', 'follow'] as const).map(at => (
            <button key={at} onClick={() => setForm(f => ({ ...f, actionType: at }))}
              style={{ padding: '12px 0', borderRadius: 8, fontSize: 14, fontWeight: 500, border: form.actionType === at ? '2px solid #2563eb' : '2px solid #e5e7eb', background: form.actionType === at ? '#2563eb' : '#fff', color: form.actionType === at ? '#fff' : '#374151' }}>
              {at === 'like' ? '❤️ Like' : at === 'reply' ? '💬 Reply' : '👤 Follow'}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Per post</label>
        <input type="number" inputMode="numeric" min={1} max={800} value={form.count}
          onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '12px', fontSize: 16, background: '#fff', marginBottom: 12, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Post URLs <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: '#9ca3af' }}>(one per line, max 20)</span></label>
        <textarea rows={4} value={form.urls}
          onChange={e => setForm(f => ({ ...f, urls: e.target.value }))}
          placeholder="https://www.instagram.com/p/SHORTCODE/"
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '12px', fontSize: 13, background: '#fff', fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box', marginBottom: 4 }} />
        {form.urls.trim() && (
          <p style={{ fontSize: 11, color: parsedCount === 0 ? '#dc2626' : '#6b7280', margin: '0 0 12px' }}>
            <b>{parsedCount}</b> valid post URL{parsedCount === 1 ? '' : 's'} detected
          </p>
        )}
        {!form.urls.trim() && <div style={{ height: 8 }} />}

        <button onClick={send} disabled={busy}
          style={{ width: '100%', padding: 16, background: busy ? '#93c5fd' : '#2563eb', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 16, border: 'none' }}>
          {busy ? 'Sending…' : parsedCount > 0 ? `Send ${parsedCount} × ${form.count} ${form.actionType}` : 'Send batch'}
        </button>
      </section>

      {/* RECENT BATCHES */}
      <section style={{ margin: '16px 12px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Recent batches</h2>
          <button onClick={reloadCampaigns} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', padding: 4 }}>Refresh</button>
        </div>

        {campaigns.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, padding: 32, background: '#fff', borderRadius: 12, border: '1px solid #f3f4f6', margin: 0 }}>
            No batches yet. Create one above ↑
          </p>
        ) : (
          <div>
            {campaigns.map(c => {
              const pct = c.total_requested > 0 ? Math.round((c.total_completed / c.total_requested) * 100) : 0;
              const isExpanded = expandedId === c.id;
              return (
                <div key={c.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 8, overflow: 'hidden' }}>
                  <button onClick={() => expandRow(c.id)}
                    style={{ width: '100%', textAlign: 'left', padding: 12, background: 'none', border: 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>@{c.as_account}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: STATUS_COLOR[c.status] || '#e5e7eb', color: '#374151' }}>
                        {c.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                      {c.total_completed.toLocaleString()} / {c.total_requested.toLocaleString()} actions
                    </div>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c.status === 'completed' ? '#22c55e' : c.status === 'failed' || c.status === 'cancelled' ? '#f87171' : '#3b82f6' }} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f3f4f6', background: '#f9fafb', padding: 8 }}>
                      {expandedItems.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, padding: '8px 0' }}>Loading…</p>}
                      {expandedItems.map(it => {
                        const shortcode = it.post_url.match(/(?:p|reel)\/([\w-]+)/)?.[1] || it.post_url.slice(-12);
                        const canRetry = it.status === 'failed' || it.status === 'partial' || it.status === 'no_targets' || it.status === 'cancelled';
                        return (
                          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid #f3f4f6' }}>
                            <a href={it.post_url} target="_blank" rel="noreferrer"
                              style={{ color: '#2563eb', fontSize: 12, flex: 1, fontFamily: 'ui-monospace, monospace', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {shortcode}
                            </a>
                            <span style={{ fontSize: 11, color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
                              {it.count_done}/{it.count_requested}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: STATUS_COLOR[it.status] || '#e5e7eb', color: '#374151' }}>
                              {it.status}
                            </span>
                            {canRetry && (
                              <button onClick={() => retry(it.id)}
                                style={{ fontSize: 11, padding: '4px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 4 }}>↻</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 24 }}>
        <a href="/marketing/instagram" style={{ color: '#9ca3af', textDecoration: 'underline' }}>Open desktop view</a>
      </p>
    </div>
  );
}
