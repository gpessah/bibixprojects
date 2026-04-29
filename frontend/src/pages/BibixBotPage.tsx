import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, StickyNote, Bell, Target, Timer, Calendar, FileText,
  MessageSquare, Mic, ScanText, Volume2, Image, Users2,
  Plus, Trash2, Check, X, Sparkles, ExternalLink, ChevronRight,
  CheckCircle2, Circle, RotateCcw, Settings,
} from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { format, parseISO, isPast } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Stats { notes: number; pendingReminders: number; activeHabits: number; completedBlocks: number; telegramLinked: boolean; telegramUsername: string | null; }
interface Note      { id: string; content: string; created_at: string; }
interface Reminder  { id: string; content: string; remind_at: string; sent: number; }
interface Habit     { id: string; title: string; description: string | null; send_time: string; active: number; }
interface TimeBlock { id: string; title: string; duration_minutes: number; scheduled_at: string; completed_at: string | null; created_at: string; }

type Tab = 'dashboard' | 'notes' | 'reminders' | 'habits' | 'timeblocks' | 'settings';

// ── Feature card definitions ──────────────────────────────────────────────────
const FEATURES = [
  { id: 'notes',    icon: StickyNote,    color: '#4F46E5', bg: '#EEF2FF', label: 'Notes',          desc: 'Capture thoughts instantly — bot saves them, web shows them all',   tab: 'notes' as Tab,       ai: false },
  { id: 'remind',   icon: Bell,          color: '#0073ea', bg: '#EFF6FF', label: 'Reminders',      desc: 'Set reminders via bot — get notified right in Telegram',            tab: 'reminders' as Tab,   ai: false },
  { id: 'habits',   icon: Target,        color: '#00c875', bg: '#ECFDF5', label: 'Habits',          desc: 'Daily nudges at your chosen time — stay consistent',                tab: 'habits' as Tab,      ai: false },
  { id: 'focus',    icon: Timer,         color: '#fdab3d', bg: '#FFFBEB', label: 'Time Blocks',     desc: 'Start a focus session — bot counts down and notifies you',          tab: 'timeblocks' as Tab,  ai: false },
  { id: 'calendar', icon: Calendar,      color: '#0078d4', bg: '#EFF6FF', label: 'Calendar',        desc: 'See all your events and board tasks in one view',                    tab: null,                  ai: false, link: '/calendar' },
  { id: 'tldr',     icon: FileText,      color: '#e2445c', bg: '#FFF1F2', label: 'TL;DR',           desc: 'Send long text — bot returns a crisp AI summary',                   tab: null,                  ai: true  },
  { id: 'gpt',      icon: MessageSquare, color: '#7C3AED', bg: '#F5F3FF', label: 'GPT Chat',        desc: 'Ask anything — get instant AI-powered answers via Telegram',        tab: null,                  ai: true  },
  { id: 'transcribe',icon: Mic,          color: '#059669', bg: '#ECFDF5', label: 'Transcribe',      desc: 'Send a voice message — get it converted to text',                   tab: null,                  ai: true  },
  { id: 'ocr',      icon: ScanText,      color: '#92400E', bg: '#FFFBEB', label: 'OCR',             desc: 'Send a photo — bot extracts all text from the image',               tab: null,                  ai: true  },
  { id: 'tts',      icon: Volume2,       color: '#0E7490', bg: '#ECFEFF', label: 'Text to Speech',  desc: 'Send text — receive an audio message back',                         tab: null,                  ai: true  },
  { id: 'image',    icon: Image,         color: '#C2410C', bg: '#FFF7ED', label: 'Create Image',    desc: 'Describe an image — AI generates it and sends it to you',           tab: null,                  ai: true  },
  { id: 'friend',   icon: Users2,        color: '#DB2777', bg: '#FDF2F8', label: 'Remind a Friend', desc: 'Schedule a Telegram message to be sent to someone later',            tab: null,                  ai: false, soon: true },
];

// ── Main page ────────────────────────────────────────────────────────────────
export default function BibixBotPage() {
  const navigate = useNavigate();
  const [tab, setTab]             = useState<Tab>('dashboard');
  const [stats, setStats]         = useState<Stats | null>(null);
  const [aiSettings, setAiSettings] = useState<{
    aiEnabled: boolean; provider: string;
    features: { chat: boolean; tldr: boolean; ocr: boolean; image: boolean; tts: boolean; transcribe: boolean };
  } | null>(null);

  const loadStats = useCallback(async () => {
    try { const { data } = await api.get('/bibixbot/stats'); setStats(data); } catch {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    api.get('/bibixbot/ai-settings').then(({ data }) => setAiSettings(data)).catch(() => {});
  }, []);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',  label: 'Dashboard',    icon: Bot },
    { id: 'notes',      label: 'Notes',        icon: StickyNote },
    { id: 'reminders',  label: 'Reminders',    icon: Bell },
    { id: 'habits',     label: 'Habits',       icon: Target },
    { id: 'timeblocks', label: 'Time Blocks',  icon: Timer },
    { id: 'settings',   label: 'Settings',     icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-8 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-monday-blue flex items-center justify-center shadow-lg">
            <Bot size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">BibixBot</h1>
            <p className="text-white/60 text-sm">Your AI-powered Telegram assistant</p>
          </div>
          {stats && (
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${stats.telegramLinked ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'}`}>
              <span className={`w-2 h-2 rounded-full ${stats.telegramLinked ? 'bg-green-400' : 'bg-white/30'}`} />
              {stats.telegramLinked ? `Connected${stats.telegramUsername ? ` @${stats.telegramUsername}` : ''}` : 'Not connected — go to Settings'}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-monday-blue text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                <Icon size={15} />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {tab === 'dashboard'  && <DashboardTab stats={stats} navigate={navigate} setTab={setTab} aiSettings={aiSettings} />}
        {tab === 'notes'      && <NotesTab onRefreshStats={loadStats} />}
        {tab === 'reminders'  && <RemindersTab onRefreshStats={loadStats} />}
        {tab === 'habits'     && <HabitsTab onRefreshStats={loadStats} />}
        {tab === 'timeblocks' && <TimeBlocksTab onRefreshStats={loadStats} />}
        {tab === 'settings'   && <SettingsTab />}
      </div>
    </div>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────
type AiSettings = { aiEnabled: boolean; provider: string; features: { chat: boolean; tldr: boolean; ocr: boolean; image: boolean; tts: boolean; transcribe: boolean } } | null;

function DashboardTab({ stats, navigate, setTab, aiSettings }: { stats: Stats | null; navigate: (path: string) => void; setTab: (t: Tab) => void; aiSettings: AiSettings }) {
  const aiEnabled   = !!aiSettings?.aiEnabled;
  const provider    = aiSettings?.provider || 'none';
  const features    = aiSettings?.features;
  const grokClient  = provider === 'grok' || provider === 'both';
  return (
    <div className="p-8">
      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Notes',             value: stats.notes,            color: '#4F46E5', icon: StickyNote, tab: 'notes' as Tab },
            { label: 'Pending Reminders', value: stats.pendingReminders, color: '#0073ea', icon: Bell,       tab: 'reminders' as Tab },
            { label: 'Active Habits',     value: stats.activeHabits,     color: '#00c875', icon: Target,     tab: 'habits' as Tab },
            { label: 'Focus Sessions',    value: stats.completedBlocks,  color: '#fdab3d', icon: Timer,      tab: 'timeblocks' as Tab },
          ].map(s => {
            const Icon = s.icon;
            return (
              <button key={s.label} onClick={() => setTab(s.tab)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-left group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.color + '20' }}>
                    <Icon size={20} style={{ color: s.color }} />
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">{s.value}</div>
                <div className="text-sm text-gray-500">{s.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Bot commands cheatsheet */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Bot size={16} className="text-monday-blue" /> Telegram Bot Commands</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { cmd: '/note [text]',               desc: 'Save a quick note' },
            { cmd: '/notes',                     desc: 'List your latest notes' },
            { cmd: '/remind',                    desc: 'Set a reminder (guided wizard)' },
            { cmd: '/reminders',                 desc: 'List pending reminders' },
            { cmd: '/habits',                    desc: 'See your active habits' },
            { cmd: '/focus 25 deep work',        desc: 'Start a 25-min focus timer' },
            { cmd: '/timezone',                  desc: 'Set your timezone' },
            { cmd: '/boards',                    desc: 'Change default board' },
            { cmd: '/menu',                      desc: 'Open interactive menu' },
            { cmd: '/help',                      desc: 'All commands' },
            ...(aiEnabled ? [
              { cmd: '/ask [question]',   desc: grokClient ? '🤖 Ask Grok anything' : '🤖 Ask ChatGPT anything' },
              { cmd: '/tldr [text]',      desc: '🤖 Summarize long text' },
              { cmd: '/ocr',              desc: '🤖 Photo → extract text' },
              ...(features?.image ? [{ cmd: '/image [prompt]', desc: '🤖 Generate image (DALL-E 3)' }] : []),
              ...(features?.tts ? [{ cmd: '/tts [text]',       desc: '🤖 Text to speech (MP3)' }] : []),
              ...(features?.transcribe ? [{ cmd: '/transcribe', desc: '🤖 Voice message → text' }] : []),
            ] : []),
          ].map(c => (
            <div key={c.cmd} className={`flex items-start gap-3 p-3 rounded-xl ${c.cmd.includes('/ask') || c.cmd.includes('/tldr') || c.cmd.includes('/image') || c.cmd.includes('/tts') || c.cmd.includes('/transcribe') || c.cmd.includes('/ocr') ? 'bg-purple-50' : 'bg-gray-50'}`}>
              <code className={`text-xs font-mono px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0 ${c.cmd.includes('/ask') || c.cmd.includes('/tldr') || c.cmd.includes('/image') || c.cmd.includes('/tts') || c.cmd.includes('/transcribe') || c.cmd.includes('/ocr') ? 'bg-purple-100 text-purple-700' : 'bg-monday-blue/10 text-monday-blue'}`}>{c.cmd}</code>
              <span className="text-xs text-gray-500 mt-0.5">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI status banner */}
      {!aiEnabled && aiSettings !== null && (
        <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <span className="text-xl">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">AI features are not enabled</p>
            <p className="text-xs text-amber-600 mt-0.5">Add <code className="bg-amber-100 px-1 rounded font-mono">OPENAI_API_KEY</code> or <code className="bg-amber-100 px-1 rounded font-mono">GROK_API_KEY</code> to <code className="bg-amber-100 px-1 rounded font-mono">backend/.env</code> and restart the server.</p>
          </div>
          <button onClick={() => setTab('settings')} className="text-xs text-amber-700 border border-amber-300 hover:bg-amber-100 px-3 py-1.5 rounded-lg whitespace-nowrap">Settings →</button>
        </div>
      )}
      {aiEnabled && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <span className="text-xl">✨</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">
              AI active —{' '}
              {provider === 'both' ? 'Grok + OpenAI' : provider === 'grok' ? 'Grok (xAI)' : 'OpenAI'}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {provider === 'grok'
                ? 'Chat, TL;DR and OCR are available. For Image, TTS and Transcription add an OpenAI key too.'
                : provider === 'both'
                ? 'All AI features active — Grok handles chat/OCR, OpenAI handles Image/TTS/Transcription.'
                : 'All AI features are active. Use /menu → 🤖 AI Tools in Telegram.'}
            </p>
          </div>
        </div>
      )}

      {/* Feature cards grid */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">All Features</h2>
      <div className="grid grid-cols-4 gap-4">
        {FEATURES.map(f => {
          const Icon     = f.icon;
          const isAI     = f.ai;
          const isSoon   = (f as { soon?: boolean }).soon;
          // Per-feature availability
          const featureKey: Record<string, keyof NonNullable<typeof features>> = {
            tldr: 'tldr', gpt: 'chat', transcribe: 'transcribe', ocr: 'ocr', tts: 'tts', image: 'image',
          };
          const fKey = featureKey[f.id];
          const featureAvailable = fKey ? (features?.[fKey] ?? false) : true;
          const locked   = (isAI && !featureAvailable) || isSoon;
          // Telegram commands for AI feature cards
          const aiCmds: Record<string, string> = {
            tldr: '/tldr', gpt: '/ask', transcribe: '/transcribe', ocr: '/ocr', tts: '/tts', image: '/image',
          };
          return (
            <button key={f.id}
              onClick={() => {
                if (locked) return;
                if (f.link) navigate(f.link);
                else if (f.tab) setTab(f.tab);
              }}
              disabled={locked}
              className={`bg-white rounded-2xl p-5 shadow-sm border text-left transition-all
                ${locked ? 'opacity-60 cursor-not-allowed border-gray-100' : 'border-gray-100 hover:border-gray-200 hover:shadow-md cursor-pointer'}`}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 relative" style={{ backgroundColor: f.bg }}>
                <Icon size={24} style={{ color: f.color }} />
                {locked && isAI && <span className="absolute -top-1 -right-1 text-sm">🔒</span>}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 text-sm">{f.label}</h3>
                {isAI && (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">
                    <Sparkles size={8} /> AI
                  </span>
                )}
                {isSoon && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Soon</span>}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              {isAI && !locked && aiCmds[f.id] && (
                <p className="text-[11px] font-mono text-purple-600 mt-2 bg-purple-50 px-2 py-1 rounded-lg">{aiCmds[f.id]}</p>
              )}
              {isAI && locked && !isSoon && (
                <p className="text-[10px] text-amber-600 mt-2">
                  {['image','tts','transcribe'].includes(f.id) && aiEnabled ? 'Requires OpenAI key' : 'Requires API key'}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────
function NotesTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [notes, setNotes]     = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bibixbot/notes'); setNotes(data); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.post('/bibixbot/notes', { content });
      setContent('');
      await load();
      onRefreshStats();
      toast.success('Note saved!');
    } catch { toast.error('Failed to save note'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try { await api.delete(`/bibixbot/notes/${id}`); setNotes(n => n.filter(x => x.id !== id)); onRefreshStats(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><StickyNote size={20} className="text-[#4F46E5]" /> Notes</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <textarea value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
          placeholder="Capture a thought… (Cmd+Enter to save)"
          rows={3}
          className="w-full text-sm text-gray-800 placeholder-gray-400 outline-none resize-none" />
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={save} disabled={saving || !content.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <Plus size={14} />{saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">Or send <code className="bg-gray-100 px-1 rounded">/note [text]</code> in Telegram</p>

      {notes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <StickyNote size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notes yet. Create one above or via Telegram.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex gap-4 group hover:border-gray-200 transition-colors">
              <div className="flex-1">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                <p className="text-xs text-gray-400 mt-2">{format(parseISO(n.created_at), 'MMM d, yyyy · h:mm a')}</p>
              </div>
              <button onClick={() => del(n.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reminders tab ─────────────────────────────────────────────────────────────
function RemindersTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [content, setContent]     = useState('');
  const [remindAt, setRemindAt]   = useState('');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bibixbot/reminders'); setReminders(data); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Default datetime = now + 1 hour
  useEffect(() => {
    const d = new Date(Date.now() + 3600000);
    d.setSeconds(0, 0);
    setRemindAt(d.toISOString().slice(0, 16));
  }, []);

  const save = async () => {
    if (!content.trim() || !remindAt) return;
    setSaving(true);
    try {
      await api.post('/bibixbot/reminders', { content, remind_at: new Date(remindAt).toISOString() });
      setContent('');
      await load();
      onRefreshStats();
      toast.success('Reminder set!');
    } catch { toast.error('Failed to set reminder'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try { await api.delete(`/bibixbot/reminders/${id}`); setReminders(r => r.filter(x => x.id !== id)); onRefreshStats(); }
    catch { toast.error('Failed to delete'); }
  };

  const pending = reminders.filter(r => !r.sent);
  const sent    = reminders.filter(r => r.sent);

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Bell size={20} className="text-[#0073ea]" /> Reminders</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">What to remind you about</label>
          <input value={content} onChange={e => setContent(e.target.value)}
            placeholder="e.g. Call the dentist"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">When</label>
          <input type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <button onClick={save} disabled={saving || !content.trim() || !remindAt}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-monday-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50">
          <Bell size={15} />{saving ? 'Setting…' : 'Set Reminder'}
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-6">Or send <code className="bg-gray-100 px-1 rounded">/remind 30m [what]</code> in Telegram — the bot will notify you when it's due.</p>

      {pending.length === 0 && sent.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><Bell size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No reminders yet.</p></div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Pending ({pending.length})</h3>
              <div className="space-y-2">
                {pending.map(r => (
                  <div key={r.id} className={`bg-white rounded-2xl border p-4 flex gap-4 group items-start ${isPast(parseISO(r.remind_at)) ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
                    <Bell size={16} className={`flex-shrink-0 mt-0.5 ${isPast(parseISO(r.remind_at)) ? 'text-amber-500' : 'text-monday-blue'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{r.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{format(parseISO(r.remind_at), 'EEE, MMM d · h:mm a')}</p>
                    </div>
                    <button onClick={() => del(r.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sent.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Sent ({sent.length})</h3>
              <div className="space-y-2 opacity-60">
                {sent.slice(0, 10).map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 items-start group">
                    <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1"><p className="text-sm text-gray-600">{r.content}</p><p className="text-xs text-gray-400 mt-1">{format(parseISO(r.remind_at), 'EEE, MMM d · h:mm a')}</p></div>
                    <button onClick={() => del(r.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Habits tab ────────────────────────────────────────────────────────────────
function HabitsTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [habits, setHabits]       = useState<Habit[]>([]);
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [sendTime, setSendTime]   = useState('09:00');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bibixbot/habits'); setHabits(data); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/bibixbot/habits', { title, description, send_time: sendTime });
      setTitle(''); setDesc(''); setSendTime('09:00');
      await load(); onRefreshStats();
      toast.success('Habit created!');
    } catch { toast.error('Failed to create habit'); }
    finally { setSaving(false); }
  };

  const toggle = async (h: Habit) => {
    try {
      await api.put(`/bibixbot/habits/${h.id}`, { active: h.active ? 0 : 1 });
      await load(); onRefreshStats();
    } catch { toast.error('Failed to update'); }
  };

  const del = async (id: string) => {
    try { await api.delete(`/bibixbot/habits/${id}`); setHabits(h => h.filter(x => x.id !== id)); onRefreshStats(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Target size={20} className="text-[#00c875]" /> Habits</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Habit title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Morning meditation"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description / motivation (optional)</label>
          <input value={description} onChange={e => setDesc(e.target.value)}
            placeholder="e.g. Take 5 deep breaths and smile"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Daily nudge time</label>
          <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <button onClick={save} disabled={saving || !title.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#00c875] text-white text-sm font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-50">
          <Plus size={15} />{saving ? 'Creating…' : 'Add Habit'}
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-6">The bot will send you a daily Telegram nudge at the configured time.</p>

      {habits.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><Target size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No habits yet. Add your first one above!</p></div>
      ) : (
        <div className="space-y-3">
          {habits.map(h => (
            <div key={h.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 group items-center hover:border-gray-200 transition-colors">
              <button onClick={() => toggle(h)} className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                style={{ borderColor: h.active ? '#00c875' : '#d1d5db', backgroundColor: h.active ? '#00c875' : 'transparent' }}>
                {h.active && <Check size={12} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${h.active ? 'text-gray-900' : 'text-gray-400'}`}>{h.title}</p>
                {h.description && <p className="text-xs text-gray-500 mt-0.5">{h.description}</p>}
                <p className="text-xs text-gray-400 mt-1">🕐 Daily at {h.send_time}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${h.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {h.active ? 'Active' : 'Paused'}
              </span>
              <button onClick={() => del(h.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Time Blocks tab ───────────────────────────────────────────────────────────
function TimeBlocksTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [blocks, setBlocks]   = useState<TimeBlock[]>([]);
  const [title, setTitle]     = useState('');
  const [duration, setDuration] = useState(25);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bibixbot/time-blocks'); setBlocks(data); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/bibixbot/time-blocks', { title, duration_minutes: duration });
      setTitle('');
      await load(); onRefreshStats();
      toast.success(`Focus session started — ${duration} min`);
    } catch { toast.error('Failed to start session'); }
    finally { setSaving(false); }
  };

  const complete = async (id: string) => {
    try { await api.put(`/bibixbot/time-blocks/${id}/complete`, {}); await load(); onRefreshStats(); toast.success('Session marked complete!'); }
    catch { toast.error('Failed to update'); }
  };

  const del = async (id: string) => {
    try { await api.delete(`/bibixbot/time-blocks/${id}`); setBlocks(b => b.filter(x => x.id !== id)); onRefreshStats(); }
    catch { toast.error('Failed to delete'); }
  };

  const PRESETS = [15, 25, 45, 60, 90];

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Timer size={20} className="text-[#fdab3d]" /> Time Blocks</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Session title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Deep work on project"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Duration</label>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setDuration(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${duration === p ? 'bg-[#fdab3d] border-[#fdab3d] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {p} min
              </button>
            ))}
            <input type="number" value={duration} onChange={e => setDuration(Math.max(1, Math.min(180, parseInt(e.target.value) || 25)))}
              min={1} max={180}
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-monday-blue" />
          </div>
        </div>
        <button onClick={start} disabled={saving || !title.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#fdab3d] text-white text-sm font-medium rounded-xl hover:bg-amber-500 disabled:opacity-50">
          <Timer size={15} />{saving ? 'Starting…' : `Start ${duration}-min Focus Session`}
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-6">Or send <code className="bg-gray-100 px-1 rounded">/focus 25 deep work</code> in Telegram — the bot will time it and notify you when done.</p>

      {blocks.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><Timer size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No sessions yet. Start your first focus block above!</p></div>
      ) : (
        <div className="space-y-3">
          {blocks.map(b => {
            const done = !!b.completed_at;
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 group items-center hover:border-gray-200 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {done ? <CheckCircle2 size={20} className="text-green-600" /> : <Timer size={20} className="text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.duration_minutes} min · {format(parseISO(b.scheduled_at || b.created_at), 'MMM d, h:mm a')}
                    {done && ` · Completed ${format(parseISO(b.completed_at!), 'h:mm a')}`}
                  </p>
                </div>
                {!done && (
                  <button onClick={() => complete(b.id)}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-200 hover:border-green-300 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                    <Check size={12} /> Done
                  </button>
                )}
                <button onClick={() => del(b.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
const TIMEZONE_OPTIONS = [
  { group: 'UTC', options: [{ label: 'UTC (Coordinated Universal Time)', value: 'UTC' }] },
  { group: 'Americas', options: [
    { label: 'Eastern Time — New York, Toronto (UTC-5/4)',    value: 'America/New_York' },
    { label: 'Central Time — Chicago, Mexico City (UTC-6/5)', value: 'America/Chicago' },
    { label: 'Mountain Time — Denver, Phoenix (UTC-7/6)',     value: 'America/Denver' },
    { label: 'Pacific Time — Los Angeles, Vancouver (UTC-8/7)',value: 'America/Los_Angeles' },
    { label: 'Alaska Time (UTC-9/8)',                          value: 'America/Anchorage' },
    { label: 'Hawaii Time (UTC-10)',                           value: 'Pacific/Honolulu' },
    { label: 'Atlantic Time — Halifax (UTC-4/3)',              value: 'America/Halifax' },
    { label: 'São Paulo, Brasília (UTC-3)',                    value: 'America/Sao_Paulo' },
    { label: 'Buenos Aires, Argentina (UTC-3)',                value: 'America/Argentina/Buenos_Aires' },
    { label: 'Bogotá, Lima, Quito (UTC-5)',                   value: 'America/Bogota' },
    { label: 'Caracas, Venezuela (UTC-4)',                     value: 'America/Caracas' },
    { label: 'Santiago, Chile (UTC-4/3)',                      value: 'America/Santiago' },
  ]},
  { group: 'Europe', options: [
    { label: 'London, Dublin (GMT/BST UTC+0/1)',               value: 'Europe/London' },
    { label: 'Paris, Berlin, Rome, Madrid (CET UTC+1/2)',      value: 'Europe/Paris' },
    { label: 'Helsinki, Athens, Kyiv (EET UTC+2/3)',           value: 'Europe/Helsinki' },
    { label: 'Istanbul (UTC+3)',                               value: 'Europe/Istanbul' },
    { label: 'Moscow, St Petersburg (UTC+3)',                  value: 'Europe/Moscow' },
  ]},
  { group: 'Africa & Middle East', options: [
    { label: 'Cairo, Egypt (UTC+2/3)',                         value: 'Africa/Cairo' },
    { label: 'Lagos, West Africa (UTC+1)',                     value: 'Africa/Lagos' },
    { label: 'Nairobi, East Africa (UTC+3)',                   value: 'Africa/Nairobi' },
    { label: 'Dubai, UAE (UTC+4)',                             value: 'Asia/Dubai' },
    { label: 'Riyadh, Saudi Arabia (UTC+3)',                   value: 'Asia/Riyadh' },
  ]},
  { group: 'Asia', options: [
    { label: 'Mumbai, Kolkata, India (IST UTC+5:30)',           value: 'Asia/Kolkata' },
    { label: 'Karachi, Pakistan (UTC+5)',                       value: 'Asia/Karachi' },
    { label: 'Dhaka, Bangladesh (UTC+6)',                       value: 'Asia/Dhaka' },
    { label: 'Bangkok, Jakarta (UTC+7)',                        value: 'Asia/Bangkok' },
    { label: 'Beijing, Shanghai, Hong Kong (UTC+8)',            value: 'Asia/Shanghai' },
    { label: 'Singapore, Kuala Lumpur (UTC+8)',                 value: 'Asia/Singapore' },
    { label: 'Tokyo, Osaka (JST UTC+9)',                        value: 'Asia/Tokyo' },
    { label: 'Seoul, South Korea (KST UTC+9)',                  value: 'Asia/Seoul' },
  ]},
  { group: 'Pacific', options: [
    { label: 'Sydney, Melbourne, Brisbane (AEDT UTC+10/11)',   value: 'Australia/Sydney' },
    { label: 'Perth, Western Australia (AWST UTC+8)',           value: 'Australia/Perth' },
    { label: 'Auckland, New Zealand (NZDT UTC+12/13)',          value: 'Pacific/Auckland' },
  ]},
];

function OpenAISettingsCard() {
  const [aiData, setAiData] = useState<{ openaiConfigured: boolean; grokConfigured: boolean; aiEnabled: boolean; provider: string } | null>(null);

  useEffect(() => {
    api.get('/bibixbot/ai-settings').then(({ data }) => setAiData(data)).catch(() => setAiData(null));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
          <Sparkles size={18} className="text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">AI Integration</h3>
          <p className="text-xs text-gray-500">Configure your AI provider to unlock smart features</p>
        </div>
        {aiData && (
          <span className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${aiData.aiEnabled ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${aiData.aiEnabled ? 'bg-green-500' : 'bg-amber-500'}`} />
            {aiData.aiEnabled
              ? (aiData.provider === 'both' ? 'Grok + OpenAI' : aiData.provider === 'grok' ? 'Grok active' : 'OpenAI active')
              : 'Not configured'}
          </span>
        )}
      </div>

      {/* Two provider cards side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Grok card */}
        <div className={`rounded-xl p-4 border ${aiData?.grokConfigured ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Grok <span className="text-gray-400 font-normal text-xs">(xAI)</span></p>
              {aiData?.grokConfigured
                ? <p className="text-xs text-green-600">✅ Connected</p>
                : <p className="text-xs text-gray-400">Not configured</p>}
            </div>
          </div>
          <div className="space-y-1 text-xs text-gray-500 mb-3">
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> Chat (Ask Grok)</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> TL;DR summaries</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> OCR / Vision</p>
            <p className="flex items-center gap-1"><span className="text-gray-300">✗</span> Image generation</p>
            <p className="flex items-center gap-1"><span className="text-gray-300">✗</span> Text to Speech</p>
            <p className="flex items-center gap-1"><span className="text-gray-300">✗</span> Transcription</p>
          </div>
          {!aiData?.grokConfigured && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>1. Get key at <a href="https://console.x.ai" target="_blank" rel="noopener noreferrer" className="text-monday-blue hover:underline inline-flex items-center gap-0.5">console.x.ai <ExternalLink size={9} /></a></p>
              <p>2. Set <code className="bg-gray-200 px-1 rounded font-mono">GROK_API_KEY=xai-...</code></p>
              <p>3. Restart backend</p>
            </div>
          )}
        </div>

        {/* OpenAI card */}
        <div className={`rounded-xl p-4 border ${aiData?.openaiConfigured ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">OpenAI</p>
              {aiData?.openaiConfigured
                ? <p className="text-xs text-green-600">✅ Connected</p>
                : <p className="text-xs text-gray-400">Not configured</p>}
            </div>
          </div>
          <div className="space-y-1 text-xs text-gray-500 mb-3">
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> Chat (Ask GPT)</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> TL;DR summaries</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> OCR / Vision</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> Image generation (DALL-E 3)</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> Text to Speech</p>
            <p className="flex items-center gap-1"><span className="text-green-500">✓</span> Transcription (Whisper)</p>
          </div>
          {!aiData?.openaiConfigured && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>1. Get key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-monday-blue hover:underline inline-flex items-center gap-0.5">platform.openai.com <ExternalLink size={9} /></a></p>
              <p>2. Set <code className="bg-gray-200 px-1 rounded font-mono">OPENAI_API_KEY=sk-...</code></p>
              <p>3. Restart backend</p>
            </div>
          )}
        </div>
      </div>

      {aiData?.aiEnabled && (
        <div className="mt-4 bg-purple-50 rounded-xl p-3">
          <p className="text-xs text-purple-700 font-medium mb-2">🤖 Available in Telegram — tap /menu → AI Tools</p>
          <div className="flex flex-wrap gap-1.5">
            {['/ask', '/tldr', '/ocr', ...(aiData.openaiConfigured ? ['/image', '/tts', '/transcribe'] : [])].map(cmd => (
              <span key={cmd} className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">{cmd}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [timezone, setTimezone]   = useState('UTC');
  const [saving, setSaving]       = useState(false);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    api.get('/bibixbot/settings').then(({ data }) => {
      setTimezone(data.timezone || 'UTC');
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const autoDetect = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch { toast.error('Could not detect timezone'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/bibixbot/settings', { timezone });
      toast.success('Settings saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  // Get a label for the current selection
  const currentLabel = TIMEZONE_OPTIONS
    .flatMap(g => g.options)
    .find(o => o.value === timezone)?.label || timezone;

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Settings</h2>
      <p className="text-gray-500 text-sm mb-8">Configure your BibixBot preferences</p>

      {/* OpenAI API Key */}
      <OpenAISettingsCard />

      {/* Timezone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <span className="text-lg">🌍</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Timezone</h3>
            <p className="text-xs text-gray-500">All reminder times and daily habit schedules use this timezone</p>
          </div>
        </div>

        {!loaded ? (
          <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue bg-white"
              >
                {TIMEZONE_OPTIONS.map(group => (
                  <optgroup key={group.group} label={group.group}>
                    {group.options.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                onClick={autoDetect}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
                title="Auto-detect from browser"
              >
                Auto-detect
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Selected: <span className="font-medium text-gray-600">{currentLabel}</span>
            </p>

            <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700 mb-4">
              💡 You can also set your timezone in Telegram with <code className="font-mono bg-blue-100 px-1 rounded">/timezone</code> or via the 🌍 Timezone button in <code className="font-mono bg-blue-100 px-1 rounded">/menu</code>
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="px-6 py-2 bg-monday-blue text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
