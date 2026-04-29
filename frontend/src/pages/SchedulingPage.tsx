import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Link2, Copy, ExternalLink, Plus, Trash2, Edit2, Check,
  X, Clock, MapPin, User, Mail, FileText, ChevronDown, ChevronUp,
  CalendarClock, Globe, AlarmCheck, Phone, MessageCircle, Send,
} from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Availability {
  timezone: string;
  buffer_minutes: number;
  monday_start: string | null;
  monday_end: string | null;
  tuesday_start: string | null;
  tuesday_end: string | null;
  wednesday_start: string | null;
  wednesday_end: string | null;
  thursday_start: string | null;
  thursday_end: string | null;
  friday_start: string | null;
  friday_end: string | null;
  saturday_start: string | null;
  saturday_end: string | null;
  sunday_start: string | null;
  sunday_end: string | null;
}

interface EventType {
  id: string;
  name: string;
  duration_minutes: number;
  description: string | null;
  color: string;
  location: string | null;
  active: number;
}

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_notes: string | null;
  guest_phone: string | null;
  guest_whatsapp: string | null;
  guest_telegram: string | null;
  start_time: string;
  end_time: string;
  status: string;
  event_type_name: string;
  guest_timezone: string;
}

type Tab = 'link' | 'event-types' | 'availability' | 'bookings';

// ── Constants ──────────────────────────────────────────────────────────────────
const COLOR_SWATCHES: { label: string; value: string; bg: string; ring: string }[] = [
  { label: 'Blue',   value: '#0073ea', bg: 'bg-[#0073ea]',   ring: 'ring-[#0073ea]'   },
  { label: 'Green',  value: '#00c875', bg: 'bg-[#00c875]',   ring: 'ring-[#00c875]'   },
  { label: 'Purple', value: '#a25ddc', bg: 'bg-[#a25ddc]',   ring: 'ring-[#a25ddc]'   },
  { label: 'Red',    value: '#e2445c', bg: 'bg-[#e2445c]',   ring: 'ring-[#e2445c]'   },
  { label: 'Orange', value: '#fdab3d', bg: 'bg-[#fdab3d]',   ring: 'ring-[#fdab3d]'   },
  { label: 'Pink',   value: '#db2777', bg: 'bg-[#db2777]',   ring: 'ring-[#db2777]'   },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const BUFFER_OPTIONS   = [0, 5, 10, 15, 30];

const DAYS: { key: keyof Availability; label: string }[] = [
  { key: 'monday_start',    label: 'Monday'    },
  { key: 'tuesday_start',   label: 'Tuesday'   },
  { key: 'wednesday_start', label: 'Wednesday' },
  { key: 'thursday_start',  label: 'Thursday'  },
  { key: 'friday_start',    label: 'Friday'    },
  { key: 'saturday_start',  label: 'Saturday'  },
  { key: 'sunday_start',    label: 'Sunday'    },
];

// Generate 30-min increments from 06:00 to 22:00
const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 6; h <= 22; h++) {
    opts.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) opts.push(`${String(h).padStart(2, '0')}:30`);
  }
  return opts;
})();

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBookingTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatBookingRange(start: string, end: string, timezone: string): string {
  try {
    const datePart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(start));
    const startTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(start));
    const endTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(end));
    return `${datePart} · ${startTime} – ${endTime}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-700',
    pending:   'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-600',
    completed: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}

// ── Toggle Switch ──────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? 'bg-monday-blue' : 'bg-gray-200'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SchedulingPage() {
  const user = useAuthStore((s: { user: import('../types').User | null }) => s.user);
  const [tab, setTab] = useState<Tab>('link');

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'link',         label: 'My Link',     icon: Link2        },
    { id: 'event-types',  label: 'Event Types', icon: CalendarClock },
    { id: 'availability', label: 'Availability', icon: Clock        },
    { id: 'bookings',     label: 'Bookings',    icon: Calendar     },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-8 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-monday-blue flex items-center justify-center shadow-lg">
            <Calendar size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Scheduling</h1>
            <p className="text-white/60 text-sm">Let others book time with you — no back-and-forth</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-monday-blue text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {tab === 'link'         && <MyLinkTab user={user} />}
        {tab === 'event-types'  && <EventTypesTab />}
        {tab === 'availability' && <AvailabilityTab />}
        {tab === 'bookings'     && <BookingsTab user={user} />}
      </div>
    </div>
  );
}

// ── Tab 1: My Link ─────────────────────────────────────────────────────────────
function MyLinkTab({ user }: { user: { id: string; name: string; avatar_color?: string } | null }) {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const bookingUrl = user ? `${window.location.origin}/schedule/${user.id}` : '';

  useEffect(() => {
    api.get('/scheduling/event-types').then(({ data }) => setEventTypes(data)).catch(() => {});
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const activeCount = eventTypes.filter(e => e.active).length;
  const initials    = user ? getInitials(user.name) : '??';
  const avatarColor = (user as { avatar_color?: string } | null)?.avatar_color ?? '#0073ea';

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Your Booking Link</h2>
      <p className="text-sm text-gray-500 mb-8">Share this link so others can book time with you — they'll see your availability and event types in real time.</p>

      {/* URL card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Your public scheduling link</label>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 truncate select-all">
            {bookingUrl || 'Loading…'}
          </div>
          <button
            onClick={copyLink}
            disabled={!bookingUrl}
            className="flex items-center gap-2 px-5 py-3 bg-monday-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <Copy size={15} />
            Copy
          </button>
        </div>

        {bookingUrl && (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-monday-blue hover:underline mt-3"
          >
            <ExternalLink size={13} />
            Open preview
          </a>
        )}
      </div>

      {/* Preview card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">What guests will see</p>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-4 mb-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">{user?.name ?? 'Your Name'}</p>
              <p className="text-sm text-gray-500">Pick a time to meet</p>
            </div>
          </div>

          {activeCount === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              No active event types yet — add some in the Event Types tab so guests can book with you.
            </div>
          ) : (
            <div className="space-y-2">
              {eventTypes.filter(e => e.active).slice(0, 3).map(et => (
                <div key={et.id} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: et.color }} />
                  <span className="text-sm font-medium text-gray-800 flex-1">{et.name}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock size={11} />
                    {et.duration_minutes} min
                  </span>
                </div>
              ))}
              {activeCount > 3 && (
                <p className="text-xs text-gray-400 text-center pt-1">+ {activeCount - 3} more event type{activeCount - 3 > 1 ? 's' : ''}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Event Types ─────────────────────────────────────────────────────────
interface EventTypeFormState {
  name: string;
  duration_minutes: number;
  color: string;
  description: string;
  location: string;
}

const EMPTY_FORM: EventTypeFormState = {
  name: '',
  duration_minutes: 30,
  color: '#0073ea',
  description: '',
  location: '',
};

function EventTypesTab() {
  const [eventTypes, setEventTypes]     = useState<EventType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showCreate, setShowCreate]     = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<EventTypeFormState>(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/event-types');
      setEventTypes(data);
    } catch {
      toast.error('Failed to load event types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowCreate(true);
  };

  const openEdit = (et: EventType) => {
    setShowCreate(false);
    setEditingId(et.id);
    setForm({
      name: et.name,
      duration_minutes: et.duration_minutes,
      color: et.color,
      description: et.description ?? '',
      location: et.location ?? '',
    });
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submitCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/scheduling/event-types', {
        name: form.name.trim(),
        duration_minutes: form.duration_minutes,
        color: form.color,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
      });
      toast.success('Event type created!');
      cancelForm();
      await load();
    } catch {
      toast.error('Failed to create event type');
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (id: string) => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/scheduling/event-types/${id}`, {
        name: form.name.trim(),
        duration_minutes: form.duration_minutes,
        color: form.color,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
      });
      toast.success('Event type updated!');
      cancelForm();
      await load();
    } catch {
      toast.error('Failed to update event type');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (et: EventType) => {
    try {
      await api.put(`/scheduling/event-types/${et.id}`, { active: et.active ? 0 : 1 });
      setEventTypes(prev => prev.map(e => e.id === et.id ? { ...e, active: et.active ? 0 : 1 } : e));
    } catch {
      toast.error('Failed to update');
    }
  };

  const deleteEventType = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/scheduling/event-types/${id}`);
      setEventTypes(prev => prev.filter(e => e.id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Event Types</h2>
          <p className="text-sm text-gray-500 mt-0.5">Define what kinds of meetings guests can book with you</p>
        </div>
        {!showCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-monday-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            <Plus size={15} />
            New Event Type
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-monday-blue/30 shadow-sm p-6 mb-5">
          <h3 className="font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <CalendarClock size={16} className="text-monday-blue" />
            New Event Type
          </h3>
          <EventTypeForm
            form={form}
            onChange={setForm}
            onSave={submitCreate}
            onCancel={cancelForm}
            saving={saving}
            submitLabel="Create"
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-24 animate-pulse" />
          ))}
        </div>
      ) : eventTypes.length === 0 && !showCreate ? (
        <div className="text-center py-20 text-gray-400">
          <CalendarClock size={44} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No event types yet</p>
          <p className="text-xs">Create your first one so guests can start booking</p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventTypes.map(et => (
            <div key={et.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-4 px-5 py-4">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: et.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-semibold text-gray-900 ${!et.active ? 'opacity-50' : ''}`}>{et.name}</p>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock size={10} />
                      {et.duration_minutes} min
                    </span>
                    {!et.active && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  {et.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{et.description}</p>
                  )}
                  {et.location && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin size={10} />
                      {et.location}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Toggle enabled={!!et.active} onChange={() => toggleActive(et)} />
                  <button
                    onClick={() => editingId === et.id ? cancelForm() : openEdit(et)}
                    className="p-2 text-gray-400 hover:text-monday-blue hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    {editingId === et.id ? <ChevronUp size={15} /> : <Edit2 size={15} />}
                  </button>
                  <button
                    onClick={() => deleteEventType(et.id)}
                    disabled={deletingId === et.id}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Inline edit form */}
              {editingId === et.id && (
                <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50">
                  <EventTypeForm
                    form={form}
                    onChange={setForm}
                    onSave={() => submitEdit(et.id)}
                    onCancel={cancelForm}
                    saving={saving}
                    submitLabel="Save Changes"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventTypeForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  submitLabel,
}: {
  form: EventTypeFormState;
  onChange: (f: EventTypeFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const set = (patch: Partial<EventTypeFormState>) => onChange({ ...form, ...patch });

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Name <span className="text-red-400">*</span></label>
        <input
          value={form.name}
          onChange={e => set({ name: e.target.value })}
          placeholder="e.g. 30-min intro call"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue"
        />
      </div>

      {/* Duration + Color row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
          <select
            value={form.duration_minutes}
            onChange={e => set({ duration_minutes: Number(e.target.value) })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue bg-white"
          >
            {DURATION_OPTIONS.map(d => (
              <option key={d} value={d}>{d} minutes</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
          <div className="flex items-center gap-2 pt-1">
            {COLOR_SWATCHES.map(sw => (
              <button
                key={sw.value}
                type="button"
                onClick={() => set({ color: sw.value })}
                title={sw.label}
                className={`w-7 h-7 rounded-full transition-all ${sw.bg} ${form.color === sw.value ? `ring-2 ring-offset-2 ${sw.ring}` : 'hover:scale-110'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => set({ description: e.target.value })}
          placeholder="Brief description of this meeting type…"
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue resize-none"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
        <input
          value={form.location}
          onChange={e => set({ location: e.target.value })}
          placeholder="Zoom link, phone, office…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-monday-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Tab 3: Availability ────────────────────────────────────────────────────────
type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

const DEFAULT_START = '09:00';
const DEFAULT_END   = '17:00';

function AvailabilityTab() {
  const [avail, setAvail]           = useState<Availability | null>(null);
  const [days, setDays]             = useState<Record<DayKey, DayState>>({
    monday:    { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    tuesday:   { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    wednesday: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    thursday:  { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    friday:    { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    saturday:  { enabled: false, start: DEFAULT_START, end: DEFAULT_END },
    sunday:    { enabled: false, start: DEFAULT_START, end: DEFAULT_END },
  });
  const [buffer, setBuffer]         = useState(0);
  const [timezone, setTimezone]     = useState('UTC');
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    api.get('/scheduling/availability').then(({ data }: { data: Availability }) => {
      setAvail(data);
      setBuffer(data.buffer_minutes ?? 0);
      setTimezone(data.timezone ?? 'UTC');

      const DAY_KEYS: DayKey[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const next = { ...days };
      for (const dk of DAY_KEYS) {
        const s = data[`${dk}_start` as keyof Availability] as string | null;
        const e = data[`${dk}_end`   as keyof Availability] as string | null;
        next[dk] = {
          enabled: s !== null && s !== '',
          start:   s || DEFAULT_START,
          end:     e || DEFAULT_END,
        };
      }
      setDays(next);
    }).catch(() => {
      toast.error('Failed to load availability');
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDay = (dk: DayKey, patch: Partial<DayState>) =>
    setDays(prev => ({ ...prev, [dk]: { ...prev[dk], ...patch } }));

  const save = async () => {
    setSaving(true);
    const DAY_KEYS: DayKey[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const payload: Record<string, string | number | null> = {
      buffer_minutes: buffer,
      timezone,
    };
    for (const dk of DAY_KEYS) {
      payload[`${dk}_start`] = days[dk].enabled ? days[dk].start : null;
      payload[`${dk}_end`]   = days[dk].enabled ? days[dk].end   : null;
    }
    try {
      await api.put('/scheduling/availability', payload);
      toast.success('Availability saved!');
    } catch {
      toast.error('Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const DAY_ENTRIES: { key: DayKey; label: string }[] = [
    { key: 'monday',    label: 'Monday'    },
    { key: 'tuesday',   label: 'Tuesday'   },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday',  label: 'Thursday'  },
    { key: 'friday',    label: 'Friday'    },
    { key: 'saturday',  label: 'Saturday'  },
    { key: 'sunday',    label: 'Sunday'    },
  ];

  if (loading) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-2xl h-14 border border-gray-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Availability</h2>
      <p className="text-sm text-gray-500 mb-6">Set the hours during which guests can book time with you</p>

      {/* Days */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 mb-5">
        {DAY_ENTRIES.map(({ key, label }) => {
          const d = days[key];
          return (
            <div key={key} className="flex items-center gap-4 px-5 py-4">
              {/* Toggle */}
              <Toggle enabled={d.enabled} onChange={v => setDay(key, { enabled: v })} />

              {/* Day label */}
              <span className={`w-28 text-sm font-medium ${d.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                {label}
              </span>

              {d.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <select
                    value={d.start}
                    onChange={e => {
                      const newStart = e.target.value;
                      // Ensure end is after start
                      const startIdx = TIME_OPTIONS.indexOf(newStart);
                      const endIdx   = TIME_OPTIONS.indexOf(d.end);
                      const newEnd   = endIdx <= startIdx ? TIME_OPTIONS[Math.min(startIdx + 1, TIME_OPTIONS.length - 1)] : d.end;
                      setDay(key, { start: newStart, end: newEnd });
                    }}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue bg-white"
                  >
                    {TIME_OPTIONS.slice(0, -1).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-sm">–</span>
                  <select
                    value={d.end}
                    onChange={e => setDay(key, { end: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue bg-white"
                  >
                    {TIME_OPTIONS.filter(t => t > d.start).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic flex-1">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Buffer time */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <AlarmCheck size={16} className="text-monday-blue" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Buffer time between meetings</p>
              <p className="text-xs text-gray-500">Breathing room between back-to-back bookings</p>
            </div>
          </div>
          <select
            value={buffer}
            onChange={e => setBuffer(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue bg-white ml-4"
          >
            {BUFFER_OPTIONS.map(b => (
              <option key={b} value={b}>{b === 0 ? 'None' : `${b} min`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timezone (read-only) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
            <Globe size={16} className="text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Timezone</p>
            <p className="text-xs text-gray-500 mt-0.5">{timezone}</p>
          </div>
          <p className="text-xs text-gray-400 max-w-[180px] text-right leading-relaxed">
            Change timezone in BibixBot settings
          </p>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-monday-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        <Check size={15} />
        {saving ? 'Saving…' : 'Save Availability'}
      </button>
    </div>
  );
}

// ── Tab 4: Bookings ────────────────────────────────────────────────────────────
function BookingsTab({ user }: { user: { id: string; name: string } | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const userTimezone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
  })();

  useEffect(() => {
    api.get('/scheduling/bookings').then(({ data }) => {
      setBookings(data);
    }).catch(() => {
      toast.error('Failed to load bookings');
    }).finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const now = new Date();
  const upcoming = bookings.filter(b => new Date(b.end_time) >= now && b.status !== 'cancelled');
  const past     = bookings.filter(b => new Date(b.end_time) <  now || b.status === 'cancelled');

  if (loading) {
    return (
      <div className="p-8 max-w-3xl space-y-3">
        {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-20 border border-gray-100 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Bookings</h2>
      <p className="text-sm text-gray-500 mb-8">All meetings guests have scheduled with you</p>

      {/* Upcoming */}
      <section className="mb-10">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Upcoming ({upcoming.length})
        </h3>

        {upcoming.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center text-gray-400">
            <Calendar size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">No upcoming bookings</p>
            <p className="text-xs">Share your booking link and guests can schedule time with you</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                timezone={userTimezone}
                expanded={expanded.has(b.id)}
                onToggle={() => toggleExpand(b.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          Past ({past.length})
        </h3>

        {past.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center text-gray-300">
            <p className="text-sm">No past bookings</p>
          </div>
        ) : (
          <div className="space-y-3 opacity-75">
            {past.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                timezone={userTimezone}
                expanded={expanded.has(b.id)}
                onToggle={() => toggleExpand(b.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BookingCard({
  booking: b,
  timezone,
  expanded,
  onToggle,
}: {
  booking: Booking;
  timezone: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasNotes    = b.guest_notes && b.guest_notes.trim().length > 0;
  const hasContacts = !!(b.guest_phone || b.guest_whatsapp || b.guest_telegram);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-monday-blue/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-sm font-bold text-monday-blue">{getInitials(b.guest_name)}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: name + event type */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm">{b.guest_name}</p>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{b.event_type_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge(b.status)}`}>
              {b.status}
            </span>
          </div>

          {/* Row 2: datetime */}
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Clock size={11} />
            {formatBookingRange(b.start_time, b.end_time, timezone)}
          </p>

          {/* Row 3: email */}
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
            <Mail size={10} />
            {b.guest_email}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
          {hasContacts && (
            <span title="Has contact info"><Phone size={13} className="text-gray-300" /></span>
          )}
          {hasNotes && (
            <span title="Has notes"><FileText size={13} className="text-gray-300" /></span>
          )}
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-3">
          {/* Guest timezone */}
          <div className="flex gap-2 text-xs text-gray-500">
            <Globe size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
            <div>
              <span className="font-medium text-gray-600">Guest timezone: </span>
              {b.guest_timezone}
              {b.guest_timezone !== timezone && (
                <span className="ml-1 text-gray-400">
                  (their local time: {formatBookingTime(b.start_time, b.guest_timezone)})
                </span>
              )}
            </div>
          </div>

          {/* Notes */}
          {hasNotes && (
            <div className="flex gap-2 text-xs text-gray-500">
              <FileText size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
              <div>
                <span className="font-medium text-gray-600 block mb-1">Guest notes</span>
                <p className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {b.guest_notes}
                </p>
              </div>
            </div>
          )}

          {/* Contact */}
          <div className="flex gap-2 text-xs text-gray-500">
            <User size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
            <div className="space-y-1">
              <div>
                <span className="font-medium text-gray-600">Email: </span>
                <a href={`mailto:${b.guest_email}`} className="text-monday-blue hover:underline">{b.guest_email}</a>
              </div>
              {b.guest_phone && (
                <div className="flex items-center gap-1">
                  <Phone size={11} className="text-gray-400" />
                  <span className="font-medium text-gray-600">Phone: </span>
                  <a href={`tel:${b.guest_phone}`} className="text-monday-blue hover:underline">{b.guest_phone}</a>
                </div>
              )}
              {b.guest_whatsapp && (
                <div className="flex items-center gap-1">
                  <MessageCircle size={11} className="text-gray-400" />
                  <span className="font-medium text-gray-600">WhatsApp: </span>
                  <a
                    href={`https://wa.me/${b.guest_whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-monday-blue hover:underline"
                  >
                    {b.guest_whatsapp}
                  </a>
                </div>
              )}
              {b.guest_telegram && (
                <div className="flex items-center gap-1">
                  <Send size={11} className="text-gray-400" />
                  <span className="font-medium text-gray-600">Telegram: </span>
                  <a
                    href={`https://t.me/${b.guest_telegram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-monday-blue hover:underline"
                  >
                    {b.guest_telegram.startsWith('@') ? b.guest_telegram : `@${b.guest_telegram}`}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
