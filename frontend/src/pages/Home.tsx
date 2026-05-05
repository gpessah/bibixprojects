import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../store/authStore';
import { format, parseISO } from 'date-fns';
import Avatar from '../components/ui/Avatar';
import { useEffect, useRef, useState } from 'react';
import { Settings, X, Check } from 'lucide-react';

// ── World Clock ───────────────────────────────────────────────────────────────

const CITIES = [
  { label: 'New York',      tz: 'America/New_York' },
  { label: 'Los Angeles',   tz: 'America/Los_Angeles' },
  { label: 'London',        tz: 'Europe/London' },
  { label: 'Paris',         tz: 'Europe/Paris' },
  { label: 'Berlin',        tz: 'Europe/Berlin' },
  { label: 'Dubai',         tz: 'Asia/Dubai' },
  { label: 'Mumbai',        tz: 'Asia/Kolkata' },
  { label: 'Singapore',     tz: 'Asia/Singapore' },
  { label: 'Tokyo',         tz: 'Asia/Tokyo' },
  { label: 'Sydney',        tz: 'Australia/Sydney' },
  { label: 'São Paulo',     tz: 'America/Sao_Paulo' },
  { label: 'Mexico City',   tz: 'America/Mexico_City' },
  { label: 'Toronto',       tz: 'America/Toronto' },
  { label: 'Chicago',       tz: 'America/Chicago' },
  { label: 'Johannesburg',  tz: 'Africa/Johannesburg' },
  { label: 'Cairo',         tz: 'Africa/Cairo' },
  { label: 'Istanbul',      tz: 'Europe/Istanbul' },
  { label: 'Moscow',        tz: 'Europe/Moscow' },
  { label: 'Beijing',       tz: 'Asia/Shanghai' },
  { label: 'Seoul',         tz: 'Asia/Seoul' },
  { label: 'Bangkok',       tz: 'Asia/Bangkok' },
  { label: 'Jakarta',       tz: 'Asia/Jakarta' },
  { label: 'Riyadh',        tz: 'Asia/Riyadh' },
  { label: 'Tel Aviv',      tz: 'Asia/Jerusalem' },
];

const DEFAULT_CITIES = ['America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo'];

function useClockTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function ClockFace({ tz, label }: { tz: string; label: string }) {
  useClockTick();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const secDeg   = ss * 6;
  const minDeg   = mm * 6 + ss * 0.1;
  const hourDeg  = (hh % 12) * 30 + mm * 0.5;

  const hand = (deg: number, len: number, width: number, color: string) => {
    const rad = (deg - 90) * (Math.PI / 180);
    const x = 50 + len * Math.cos(rad);
    const y = 50 + len * Math.sin(rad);
    return <line x1="50" y1="50" x2={x} y2={y} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const rad = (i * 30 - 90) * (Math.PI / 180);
    const x1 = 50 + 42 * Math.cos(rad);
    const y1 = 50 + 42 * Math.sin(rad);
    const x2 = 50 + 46 * Math.cos(rad);
    const y2 = 50 + 46 * Math.sin(rad);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d1d5db" strokeWidth="2" />;
  });

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="w-20 h-20">
        <circle cx="50" cy="50" r="48" fill="white" stroke="#e5e7eb" strokeWidth="2" />
        {ticks}
        {hand(hourDeg, 28, 3, '#1f2937')}
        {hand(minDeg,  36, 2, '#1f2937')}
        {hand(secDeg,  40, 1, '#ef4444')}
        <circle cx="50" cy="50" r="2.5" fill="#1f2937" />
      </svg>
      <div className="text-xs font-semibold text-gray-700 mt-1 tabular-nums">{timeStr.slice(0,5)}</div>
      <div className="text-[10px] text-gray-400">{dateStr}</div>
      <div className="text-[10px] font-medium text-gray-500 mt-0.5 truncate max-w-[80px] text-center">{label}</div>
    </div>
  );
}

function WorldClocks({ userId }: { userId: string }) {
  const storageKey = `world_clocks_${userId}`;
  const saved = localStorage.getItem(storageKey);
  const [selected, setSelected] = useState<string[]>(saved ? JSON.parse(saved) : DEFAULT_CITIES);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  const save = () => {
    setSelected(draft);
    localStorage.setItem(storageKey, JSON.stringify(draft));
    setEditing(false);
  };

  const toggle = (tz: string) => {
    setDraft(d => d.includes(tz) ? d.filter(t => t !== tz) : d.length < 6 ? [...d, tz] : d);
  };

  const filtered = CITIES.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">World Clocks</span>
        <button onClick={() => { setDraft(selected); setSearch(''); setEditing(true); }}
          className="text-gray-400 hover:text-gray-600 p-1 rounded">
          <Settings size={14} />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {selected.map(tz => {
          const city = CITIES.find(c => c.tz === tz);
          return city ? <ClockFace key={tz} tz={tz} label={city.label} /> : null;
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div ref={modalRef} className="bg-white rounded-2xl shadow-xl w-96 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Select Cities</h3>
                <p className="text-xs text-gray-400 mt-0.5">{draft.length}/6 selected</p>
              </div>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-5 pt-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cities..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1">
              {filtered.map(city => {
                const on = draft.includes(city.tz);
                const disabled = !on && draft.length >= 6;
                return (
                  <button key={city.tz} onClick={() => !disabled && toggle(city.tz)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${on ? 'bg-blue-50 text-monday-blue' : disabled ? 'opacity-40 cursor-not-allowed text-gray-500' : 'hover:bg-gray-50 text-gray-700'}`}>
                    <span>{city.label}</span>
                    {on && <Check size={14} className="text-monday-blue" />}
                  </button>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={save} className="px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { workspaces, boards } = useWorkspaceStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const allBoards = Object.values(boards).flat();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-8">
          {user && <Avatar name={user.name} color={user.avatar_color} size="lg" />}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-gray-500 mt-1">Here's what's happening across your boards</p>
          </div>
        </div>

        {user && <WorldClocks userId={user.id} />}

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-blue">{workspaces.length}</div>
            <div className="text-sm text-gray-500 mt-1">Workspaces</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-green">{allBoards.length}</div>
            <div className="text-sm text-gray-500 mt-1">Boards</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-orange">{workspaces.filter(w => w.role === 'owner').length}</div>
            <div className="text-sm text-gray-500 mt-1">Owned workspaces</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Boards</h2>
        {allBoards.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 text-sm">No boards yet — create one from the sidebar!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {allBoards.map(board => {
              const ws = workspaces.find(w => w.id === board.workspace_id);
              return (
                <button key={board.id} onClick={() => navigate(`/board/${board.id}`)}
                  className="bg-white rounded-xl p-5 border border-gray-200 hover:border-monday-blue hover:shadow-md transition-all text-left group">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{board.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 group-hover:text-monday-blue truncate">{board.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{ws?.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{format(parseISO(board.created_at), 'MMM d, yyyy')}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
