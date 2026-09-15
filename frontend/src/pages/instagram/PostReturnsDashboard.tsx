import { useEffect, useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Heart, MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import api from '../../api/client';

interface PostRow {
  post_url: string;
  post_owner: string | null;
  my_profiles: string[];
  first_at: string;
  last_at: string;
  targets: number;
  likes: number;
  follows: number;
  replies: number;
  returned: number;
  followed: number;
  liked: number;
  commented: number;
  avg_hours_to_return: number | null;
  rate: number | null;
}

interface Returns {
  window: { label: string; return_days: number };
  profiles: string[];
  totals: {
    posts: number; users: number; returned: number; rate: number | null;
    likes: number; follows: number; replies: number;
    followed: number; liked: number; commented: number;
  };
  posts: PostRow[];
}

interface ReturnUser {
  username: string;
  my_profile: string | null;
  first_at: string;
  full_name: string | null;
  follower_count: number | null;
  my_actions: { type: string; at: string }[];
  returns: { type: string; group: string; at: string; post_url: string | null; hours_after: number }[];
  returned: boolean;
}

interface Props {
  asUser: string;
  refreshTick: number;
  onRefresh: () => void;
}

const ACTION_LABEL: Record<string, string> = {
  like: '❤️ liked comment', follow: '👤 followed', comment: '💬 commented', comment_reply: '💬 replied', reply: '💬 replied',
};
const RETURN_LABEL: Record<string, string> = {
  new_follower: '➕ followed me',
  received_like_post: '❤️ liked my post', got_like_post: '❤️ liked my post',
  received_like_reel: '❤️ liked my reel', got_like_reel: '❤️ liked my reel',
  received_like_comment: '❤️ liked my comment', got_like_comment: '❤️ liked my comment',
  received_comment: '💬 commented', got_comment: '💬 commented',
  received_reply: '↩️ replied', got_reply: '↩️ replied',
  received_mention: '📣 mentioned me', got_mention: '📣 mentioned me',
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDay = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtHours = (h: number | null) => {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
};
const shortPost = (url: string) => {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p.length > 28 ? p.slice(0, 28) + '…' : p || url;
  } catch { return url; }
};
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

// Collapse repeated events of one type into "type ×N · first → last".
function summarize<T extends { type: string; at: string }>(items: T[]) {
  const groups = new Map<string, { type: string; count: number; first: string; last: string; sample: T }>();
  for (const it of items) {
    const g = groups.get(it.type);
    if (!g) groups.set(it.type, { type: it.type, count: 1, first: it.at, last: it.at, sample: it });
    else { g.count++; if (it.at < g.first) g.first = it.at; if (it.at > g.last) g.last = it.at; }
  }
  return [...groups.values()].sort((a, b) => (a.first < b.first ? -1 : 1));
}
const spanLabel = (g: { count: number; first: string; last: string }) =>
  g.count > 1 && g.first.slice(0, 16) !== g.last.slice(0, 16) ? `${fmtDate(g.first)} → ${fmtDate(g.last)}` : fmtDate(g.first);

export default function PostReturnsDashboard({ asUser, refreshTick, onRefresh }: Props) {
  const [days, setDays] = useState(90);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [profile, setProfile] = useState('');
  const [returnDays, setReturnDays] = useState(30);
  const [data, setData] = useState<Returns | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [users, setUsers] = useState<Record<string, ReturnUser[] | 'loading' | 'error'>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const baseParams = () => {
    const p = new URLSearchParams();
    if (from && to) { p.set('from', from); p.set('to', to); } else p.set('days', String(days));
    if (profile) p.set('profiles', profile);
    p.set('return_days', String(returnDays));
    if (asUser) p.set('as_user', asUser);
    return p;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/instagram/post-returns?${baseParams().toString()}`)
      .then((r: { data: Returns }) => { if (!cancelled) setData(r.data); })
      .catch((e: unknown) => {
        const err = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
        if (!cancelled) setError(`Could not load returns (HTTP ${err.response?.status ?? '?'}): ${err.response?.data?.error || err.message || 'unknown'}`);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    setUsers({});
    setOpenPost(null);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, from, to, profile, returnDays, asUser, refreshTick]);

  const toggle = (postUrl: string) => {
    if (openPost === postUrl) { setOpenPost(null); return; }
    setOpenPost(postUrl);
    if (users[postUrl] && users[postUrl] !== 'error') return;   // re-opening after an error retries
    setUsers(u => ({ ...u, [postUrl]: 'loading' }));
    const p = baseParams();
    p.set('post_url', postUrl);
    api.get(`/instagram/post-returns/users?${p.toString()}`)
      .then((r: { data: { users: ReturnUser[] } }) => setUsers(u => ({ ...u, [postUrl]: r.data.users })))
      .catch(() => setUsers(u => ({ ...u, [postUrl]: 'error' })));
  };

  const t = data?.totals;
  const tile = (label: string, value: string | number, hint?: string, accent?: string) => (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-[120px] flex-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${accent || 'text-gray-900'}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
  const btn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`;

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Who came back</h3>
            <p className="text-xs text-gray-500">
              For each post you engaged on: how many of those people followed you, liked or commented on your account within {returnDays} days.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-auto items-center">
            {[7, 30, 90, 180].map(d => (
              <button key={d} onClick={() => { setDays(d); setFrom(''); setTo(''); }} className={btn(!from && days === d)}>{d} days</button>
            ))}
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-blue-300">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">My account</label>
            <select value={profile} onChange={e => setProfile(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px]">
              <option value="">All accounts</option>
              {(data?.profiles || []).map(p => <option key={p} value={p}>@{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Count returns within</label>
            <select value={returnDays} onChange={e => setReturnDays(parseInt(e.target.value, 10))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days after my action</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400 max-w-md">
            Returns are what the extension has seen: keep <b>Scan Notifications</b> and <b>Snapshot Followers</b> running (or automated) or they are undercounted.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error} <button onClick={onRefresh} className="underline ml-2">Retry</button>
        </div>
      )}

      {/* ── Totals ── */}
      {t && (
        <div className="flex flex-wrap gap-3">
          {tile('Posts', t.posts, data?.window.label)}
          {tile('People I engaged', t.users, `${t.likes} likes · ${t.follows} follows · ${t.replies} replies`)}
          {tile('Came back', t.returned, `${pct(t.rate)} of people`, 'text-green-600')}
          {tile('Followed me', t.followed, undefined, 'text-purple-600')}
          {tile('Liked my content', t.liked, undefined, 'text-pink-600')}
          {tile('Commented / mentioned', t.commented, undefined, 'text-blue-600')}
        </div>
      )}

      {/* ── Per-post table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Post</th>
                <th className="px-4 py-2.5">My actions</th>
                <th className="px-4 py-2.5 text-right">People</th>
                <th className="px-4 py-2.5 text-right text-purple-600"><span className="inline-flex items-center gap-1"><UserPlus size={12} /> Followed</span></th>
                <th className="px-4 py-2.5 text-right text-pink-600"><span className="inline-flex items-center gap-1"><Heart size={12} /> Liked</span></th>
                <th className="px-4 py-2.5 text-right text-blue-600"><span className="inline-flex items-center gap-1"><MessageCircle size={12} /> Commented</span></th>
                <th className="px-4 py-2.5 text-right">Came back</th>
                <th className="px-4 py-2.5 text-right">Rate</th>
                <th className="px-4 py-2.5 text-right">Avg. time</th>
              </tr>
            </thead>
            <tbody>
              {!data && loading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
              )}
              {data && data.posts.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                  No likes, follows or replies in this period. Run an action from the extension and it will show up here.
                </td></tr>
              )}
              {data?.posts.map(p => {
                const open = openPost === p.post_url;
                const list = users[p.post_url];
                const label = p.post_url ? shortPost(p.post_url) : 'No post (profile actions)';
                return (
                  <Fragment key={p.post_url || '__none__'}>
                    <tr onClick={() => toggle(p.post_url)}
                      className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${open ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 flex items-center gap-1.5">
                          {p.post_owner ? `@${p.post_owner}` : label}
                          {p.post_url && (
                            <a href={p.post_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="text-gray-400 hover:text-blue-600" title={p.post_url}><ExternalLink size={12} /></a>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {p.post_owner && p.post_url ? label + ' · ' : ''}{fmtDay(p.first_at)}{p.last_at !== p.first_at ? ` → ${fmtDay(p.last_at)}` : ''}
                          {p.my_profiles.length > 0 && ` · as @${p.my_profiles.join(', @')}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {p.likes > 0 && <span className="mr-2">❤️ {p.likes}</span>}
                        {p.follows > 0 && <span className="mr-2">👤 {p.follows}</span>}
                        {p.replies > 0 && <span>💬 {p.replies}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{p.targets}</td>
                      <td className="px-4 py-3 text-right text-purple-700">{p.followed || <span className="text-gray-300">0</span>}</td>
                      <td className="px-4 py-3 text-right text-pink-700">{p.liked || <span className="text-gray-300">0</span>}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{p.commented || <span className="text-gray-300">0</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{p.returned}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block min-w-[48px] text-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.rate == null ? 'bg-gray-100 text-gray-400' : p.rate >= 20 ? 'bg-green-100 text-green-700' : p.rate >= 8 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          {pct(p.rate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{fmtHours(p.avg_hours_to_return)}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <td colSpan={10} className="px-6 py-4">
                          {list === 'loading' || list === undefined ? (
                            <div className="text-sm text-gray-400">Loading people…</div>
                          ) : list === 'error' ? (
                            <div className="text-sm text-red-600">Could not load the people for this post.</div>
                          ) : (
                            <UserList users={list} showAll={!!showAll[p.post_url]} onShowAll={() => setShowAll(s => ({ ...s, [p.post_url]: true }))} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UserList({ users, showAll, onShowAll }: { users: ReturnUser[]; showAll: boolean; onShowAll: () => void }) {
  const returned = users.filter(u => u.returned);
  const silent = users.filter(u => !u.returned);
  const shown = showAll ? users : [...returned, ...silent.slice(0, Math.max(0, 25 - returned.length))];
  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">
        <b className="text-green-700">{returned.length}</b> of {users.length} people came back
        {silent.length > 0 && <> · <span className="text-gray-400">{silent.length} did nothing (yet)</span></>}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-1.5 pr-4">Person</th>
            <th className="py-1.5 pr-4">What I did</th>
            <th className="py-1.5 pr-4">What they did back</th>
            <th className="py-1.5 pr-4 text-right">After</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(u => (
            <tr key={u.username} className={`border-t border-gray-100 ${u.returned ? '' : 'text-gray-400'}`}>
              <td className="py-2 pr-4 whitespace-nowrap">
                <a href={`https://www.instagram.com/${u.username}/`} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:text-blue-600">@{u.username}</a>
                {u.full_name && <span className="text-gray-400 ml-1.5">{u.full_name}</span>}
                {u.follower_count != null && <span className="text-gray-400 ml-1.5">· {u.follower_count.toLocaleString()} followers</span>}
              </td>
              <td className="py-2 pr-4 text-gray-600">
                {summarize(u.my_actions).map(g => (
                  <div key={g.type} className="whitespace-nowrap">
                    {ACTION_LABEL[g.type] || g.type}{g.count > 1 && <b className="font-semibold"> ×{g.count}</b>}
                    <span className="text-gray-400"> · {spanLabel(g)}</span>
                  </div>
                ))}
              </td>
              <td className="py-2 pr-4">
                {u.returns.length === 0 ? <span className="text-gray-300">—</span> : summarize(u.returns).map(g => (
                  <div key={g.type} className={`whitespace-nowrap ${g.sample.group === 'followed' ? 'text-purple-700' : g.sample.group === 'liked' ? 'text-pink-700' : 'text-blue-700'}`}>
                    {RETURN_LABEL[g.type] || g.type}{g.count > 1 && <b className="font-semibold"> ×{g.count}</b>}
                    <span className="text-gray-400"> · {spanLabel(g)}</span>
                  </div>
                ))}
              </td>
              <td className="py-2 text-right whitespace-nowrap">{u.returns.length ? fmtHours(u.returns[0].hours_after) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && shown.length < users.length && (
        <button onClick={onShowAll} className="mt-2 text-xs text-blue-600 hover:underline">
          Show all {users.length} people
        </button>
      )}
    </div>
  );
}
