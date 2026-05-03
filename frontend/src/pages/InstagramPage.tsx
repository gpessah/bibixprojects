import { useEffect, useState } from 'react';
import { BarChart2, Clock, Zap, Users, Instagram, ChevronDown } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';

type Tab = 'dashboard' | 'history' | 'campaigns';

interface Action {
  id: string; type: string; username: string | null; follower_count: number | null;
  post_url: string | null; reply_text: string | null; comment_text: string | null;
  campaign_id: string | null; created_at: string;
}
interface Campaign {
  id: string; type: string; status: string; actions_count: number;
  new_followers: number; started_at: string; ended_at: string | null; notes: string | null;
}
interface Stats {
  total: number; follows: number; newFollowers: number; followBack: number;
  byType: { type: string; n: number }[];
  daily: { day: string; type: string; n: number }[];
  topUsers: { username: string; n: number }[];
}
interface AdminUser {
  id: string; name: string; email: string; total_actions: number;
  total_campaigns: number; last_action: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  like: '❤️ Like', reply: '💬 Reply', follow: '➕ Follow',
  unfollow: '➖ Unfollow', notification_scan: '🔔 Scan',
};
const TYPE_COLOR: Record<string, string> = {
  like: 'bg-pink-100 text-pink-700', reply: 'bg-blue-100 text-blue-700',
  follow: 'bg-green-100 text-green-700', unfollow: 'bg-gray-100 text-gray-600',
  notification_scan: 'bg-purple-100 text-purple-700',
};
const STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700',
  stopped: 'bg-gray-100 text-gray-600',
};

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InstagramPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('dashboard');
  const [days, setDays] = useState(30);
  const [asUser, setAsUser] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const qs = asUser ? `?as_user=${asUser}` : '';

  useEffect(() => {
    if (isAdmin) api.get('/instagram/admin/users').then((r: { data: AdminUser[] }) => setAdminUsers(r.data));
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    const q = asUser ? `?days=${days}&as_user=${asUser}` : `?days=${days}`;
    api.get(`/instagram/stats${q}`).then((r: { data: Stats }) => setStats(r.data)).finally(() => setLoading(false));
  }, [days, asUser]);

  useEffect(() => {
    const q = typeFilter ? `${qs ? qs + '&' : '?'}type=${typeFilter}&limit=300` : `${qs || ''}${qs ? '&' : '?'}limit=300`;
    api.get(`/instagram/actions${q}`).then((r: { data: Action[] }) => setActions(r.data));
  }, [asUser, typeFilter]);

  useEffect(() => {
    api.get(`/instagram/campaigns${qs}`).then((r: { data: Campaign[] }) => setCampaigns(r.data));
  }, [asUser]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={15} /> },
    { id: 'history',   label: 'History',   icon: <Clock size={15} /> },
    { id: 'campaigns', label: 'Campaigns', icon: <Zap size={15} /> },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Instagram size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Instagram Analytics</h1>
              <p className="text-sm text-gray-500">Track your automation history and performance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && adminUsers.length > 0 && (
              <div className="relative">
                <select
                  value={asUser}
                  onChange={e => setAsUser(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">My data</option>
                  {adminUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.total_actions} actions)</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            <div className="flex gap-2 mb-6">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {d} days
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : stats && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Total Actions', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Follows Sent', value: stats.follows, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'New Followers', value: stats.newFollowers, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Follow-back %', value: `${stats.followBack}%`, color: 'text-orange-600', bg: 'bg-orange-50' },
                  ].map(c => (
                    <div key={c.label} className={`${c.bg} rounded-xl p-5`}>
                      <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
                      <div className="text-sm text-gray-600 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Actions by Type</h3>
                    <div className="space-y-3">
                      {(stats.byType || []).map(r => (
                        <div key={r.type} className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[r.type] || 'bg-gray-100 text-gray-600'}`}>
                            {TYPE_LABEL[r.type] || r.type}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (r.n / Math.max(stats.total, 1)) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 w-8 text-right">{r.n}</span>
                        </div>
                      ))}
                      {(stats.byType || []).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Top Users Engaged</h3>
                    <div className="space-y-2">
                      {(stats.topUsers || []).map((u, i) => (
                        <div key={u.username} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                          <span className="text-sm font-medium text-gray-700 flex-1">@{u.username}</span>
                          <span className="text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded-full">{u.n}</span>
                        </div>
                      ))}
                      {(stats.topUsers || []).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {['', 'like', 'reply', 'follow', 'unfollow', 'notification_scan'].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {t ? (TYPE_LABEL[t] || t) : 'All'}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Username</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Followers</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Details</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map(a => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[a.type] || 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABEL[a.type] || a.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.username ? `@${a.username}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{a.follower_count?.toLocaleString() ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                        {a.reply_text || a.comment_text || (a.post_url ? <a href={a.post_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Post ↗</a> : '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmt(a.created_at)}</td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No actions recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CAMPAIGNS ── */}
        {tab === 'campaigns' && (
          <div className="space-y-3">
            {campaigns.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 capitalize">{c.type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-400">{fmt(c.started_at)}</span>
                </div>
                <div className="flex gap-6 text-sm">
                  <div><span className="text-gray-500">Actions:</span> <span className="font-semibold">{c.actions_count}</span></div>
                  <div><span className="text-gray-500">New followers:</span> <span className="font-semibold text-green-600">+{c.new_followers}</span></div>
                  {c.ended_at && <div><span className="text-gray-500">Ended:</span> <span className="font-semibold">{fmt(c.ended_at)}</span></div>}
                </div>
                {c.notes && <p className="text-sm text-gray-500 mt-2">{c.notes}</p>}
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No campaigns yet. Run the extension to start tracking.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
