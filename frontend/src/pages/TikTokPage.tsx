// TikTok marketing module — scaffold.
//
// Mirrors the InstagramPage tab structure so the UX is consistent, but the
// interior is intentionally minimal for now: placeholder empty states with
// "Coming soon" messages that explain what each tab will do.
//
// The path forward from here — pick when ready:
//   • Manual tracking: add per-tab CRUD so the user can log TikTok actions
//     by hand. Same DB shape as instagram_actions, just tiktok_actions.
//   • Full clone incl. extension: build a TikTok Chrome extension similar
//     to the IG one. That's a multi-week project (TikTok's DOM + anti-bot
//     is different) — we scaffold the frontend so it's ready to render
//     data when the extension starts POSTing.
//
// Rendering-wise this is a static component (no data fetches yet) so it can
// never crash or hang the app the way InstagramPage did today.

import { useState } from 'react';
import { Music2, BarChart3, Clock, Zap, Users, Search, Activity } from 'lucide-react';

type Tab = 'dashboard' | 'history' | 'batches' | 'followers' | 'research';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
  { id: 'history',   label: 'History',   icon: <Clock size={15} /> },
  { id: 'batches',   label: 'Batches',   icon: <Zap size={15} /> },
  { id: 'followers', label: 'Followers', icon: <Users size={15} /> },
  { id: 'research',  label: 'Research',  icon: <Search size={15} /> },
];

// Per-tab placeholder copy. Kept here (not scattered inside the render) so
// it's easy to swap out as each tab gets its real UI.
const PLACEHOLDERS: Record<Tab, { title: string; body: string }> = {
  dashboard: {
    title: 'Dashboard',
    body: 'Follower growth chart, action-count summary, top-performing videos. Populates once TikTok actions are recorded.',
  },
  history: {
    title: 'History',
    body: 'A log of every action taken (likes, follows, comments) with target user, video, and result.',
  },
  batches: {
    title: 'Action Batches',
    body: 'Queue N likes / follows / comments across M videos to run automatically via the extension.',
  },
  followers: {
    title: 'Follower snapshots',
    body: 'Daily follower-count captures per tracked TikTok account, with delta over time.',
  },
  research: {
    title: 'Profile research',
    body: 'Scrape a TikTok profile\'s recent videos + engagement stats for targeting.',
  },
};

export default function TikTokPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const p = PLACEHOLDERS[tab];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 via-red-500 to-cyan-400 flex items-center justify-center shadow-md">
          <Music2 size={28} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TikTok Marketing</h1>
          <p className="text-sm text-gray-500">Automation history and performance for TikTok.</p>
          <p className="text-[11px] text-amber-600 mt-1">
            ⚙️ Scaffold — this module is being built. Tabs below are placeholders.
          </p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Placeholder body ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
          <Activity size={28} className="text-gray-300" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{p.title}</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">{p.body}</p>
        <p className="text-xs text-gray-400 mt-4">Coming soon.</p>
      </div>
    </div>
  );
}
