import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  CheckCircle,
  Loader2,
  Calendar,
  Video,
  Phone,
  Globe,
} from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicUser {
  id: string;
  name: string;
  avatar_color: string;
}

interface EventType {
  id: string;
  name: string;
  duration_minutes: number;
  description: string;
  color: string;
  location: string;
}

interface Slot {
  start: string;
  end: string;
}

interface BookingResult {
  id: string;
  guest_name: string;
  guest_email: string;
  start_time: string;
  end_time: string;
}

type Step = 'types' | 'datetime' | 'form' | 'confirmed';

interface DayCell {
  date: string; // YYYY-MM-DD
  day: number;
  currentMonth: boolean;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function formatSlotTime(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(new Date(isoString));
}

function formatDateLong(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(isoString));
}

function getDayOfWeek(dateStr: string): string {
  // dateStr: YYYY-MM-DD
  // We parse it as local date to avoid timezone shifts on day-of-week calculation
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Returns weeks (arrays of DayCells) for a given display month (0-indexed). */
function buildCalendarWeeks(year: number, month: number): DayCell[][] {
  // First day of month
  const firstDay = new Date(year, month, 1);
  // We show Mon–Sun: adjust so Monday = 0
  // getDay(): 0=Sun,1=Mon,...,6=Sat → Mon-based: (getDay()+6)%7
  const startOffset = (firstDay.getDay() + 6) % 7;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: DayCell[] = [];

  // Pad with previous month days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    cells.push({ date: toDateStr(prevYear, prevMonth, d), day: d, currentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toDateStr(year, month, d), day: d, currentMonth: true });
  }

  // Pad to complete last week
  const remaining = (7 - (cells.length % 7)) % 7;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: toDateStr(nextYear, nextMonth, d), day: d, currentMonth: false });
  }

  // Split into weeks
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function buildGoogleCalendarUrl(params: {
  title: string;
  startISO: string;
  endISO: string;
  location?: string;
  description?: string;
}): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const p = new URLSearchParams({
    text: params.title,
    dates: `${fmt(params.startISO)}/${fmt(params.endISO)}`,
    ...(params.location ? { location: params.location } : {}),
    ...(params.description ? { details: params.description } : {}),
  });
  return `${base}&${p.toString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserAvatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const sizeClass =
    size === 'lg' ? 'w-16 h-16 text-xl' : size === 'md' ? 'w-12 h-12 text-base' : 'w-8 h-8 text-sm';
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

function LocationIcon({ location }: { location: string }) {
  const l = (location || '').toLowerCase();
  if (l.includes('zoom') || l.includes('meet') || l.includes('teams') || l.includes('video')) {
    return <Video size={14} className="flex-shrink-0" />;
  }
  if (l.includes('phone') || l.includes('call')) {
    return <Phone size={14} className="flex-shrink-0" />;
  }
  if (l.includes('http')) {
    return <Globe size={14} className="flex-shrink-0" />;
  }
  return <MapPin size={14} className="flex-shrink-0" />;
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 size={28} className="animate-spin text-monday-blue" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BookingPage() {
  const { userId } = useParams<{ userId: string }>();

  // Global
  const [step, setStep] = useState<Step>('types');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [publicUser, setPublicUser] = useState<PublicUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);

  // Step 2
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Step 3
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestWhatsapp, setGuestWhatsapp] = useState('');
  const [guestTelegram, setGuestTelegram] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 4
  const [booking, setBooking] = useState<BookingResult | null>(null);

  const guestTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoadingProfile(true);
    api
      .get(`/scheduling/public/${userId}`)
      .then(r => {
        setPublicUser(r.data.user);
        setEventTypes(r.data.eventTypes || []);
      })
      .catch(() => setProfileError('Could not load this booking page. The link may be invalid.'))
      .finally(() => setLoadingProfile(false));
  }, [userId]);

  // ── Fetch slots when date selected ──────────────────────────────────────────
  const fetchSlots = useCallback(
    async (date: string) => {
      if (!userId || !selectedEventType) return;
      setLoadingSlots(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const r = await api.get(`/scheduling/public/${userId}/slots`, {
          params: { eventTypeId: selectedEventType.id, date },
        });
        setSlots(r.data.slots || []);
      } catch {
        toast.error('Could not load available times.');
      } finally {
        setLoadingSlots(false);
      }
    },
    [userId, selectedEventType]
  );

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    fetchSlots(date);
  };

  // ── Submit booking ───────────────────────────────────────────────────────────
  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedEventType || !selectedSlot) return;
    setSubmitting(true);
    try {
      const r = await api.post(`/scheduling/public/${userId}/book`, {
        eventTypeId: selectedEventType.id,
        guestName,
        guestEmail,
        guestPhone:    guestPhone.trim()    || undefined,
        guestWhatsapp: guestWhatsapp.trim() || undefined,
        guestTelegram: guestTelegram.trim() || undefined,
        guestNotes,
        startTime: selectedSlot.start,
        guestTimezone,
      });
      setBooking(r.data);
      setStep('confirmed');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Booking failed. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetAll = () => {
    setStep('types');
    setSelectedEventType(null);
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setGuestWhatsapp('');
    setGuestTelegram('');
    setGuestNotes('');
    setBooking(null);
    setCalYear(new Date().getFullYear());
    setCalMonth(new Date().getMonth());
  };

  // ── Calendar helpers ─────────────────────────────────────────────────────────
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const weeks = buildCalendarWeeks(calYear, calMonth);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
  };

  const isDayClickable = (cell: DayCell): boolean => {
    if (!cell.currentMonth) return false;
    if (cell.date < todayStr) return false;
    return true;
  };

  // ─── RENDER: Loading / Error ────────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-monday-blue" />
      </div>
    );
  }

  if (profileError || !publicUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Page not found</h2>
          <p className="text-gray-500">{profileError || 'This booking page does not exist.'}</p>
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 1 — Pick event type ────────────────────────────────────────
  if (step === 'types') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <UserAvatar name={publicUser.name} color={publicUser.avatar_color} size="lg" />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">{publicUser.name}</h1>
            <p className="mt-1 text-gray-500">Book a meeting</p>
          </div>

          {/* Event types */}
          {eventTypes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Calendar size={40} className="mx-auto mb-3" />
              <p className="text-lg">No event types available at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventTypes.map(et => (
                <button
                  key={et.id}
                  onClick={() => {
                    setSelectedEventType(et);
                    setStep('datetime');
                  }}
                  className="text-left bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-gray-200 transition-all group"
                >
                  {/* Colored left accent border */}
                  <div className="flex">
                    <div className="w-1.5 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: et.color }} />
                    <div className="p-5 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-monday-blue transition-colors truncate">
                            {et.name}
                          </h3>
                          {et.description && (
                            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{et.description}</p>
                          )}
                        </div>
                        <span
                          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: `${et.color}18`, color: et.color }}
                        >
                          <Clock size={11} />
                          {et.duration_minutes} min
                        </span>
                      </div>
                      {et.location && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                          <LocationIcon location={et.location} />
                          <span className="truncate">{et.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 2 — Pick date & time ───────────────────────────────────────
  if (step === 'datetime' && selectedEventType) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex flex-col md:flex-row min-h-[520px]">
              {/* LEFT PANEL */}
              <div className="md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 p-6 flex flex-col gap-4">
                <button
                  onClick={() => { setStep('types'); setSelectedEventType(null); setSelectedDate(null); setSlots([]); setSelectedSlot(null); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors self-start"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>

                <div className="flex items-center gap-2 mt-1">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedEventType.color }} />
                  <span className="font-semibold text-gray-900 text-sm">{selectedEventType.name}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={14} className="flex-shrink-0 text-gray-400" />
                  {selectedEventType.duration_minutes} min
                </div>

                {selectedEventType.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <LocationIcon location={selectedEventType.location} />
                    <span className="break-words">{selectedEventType.location}</span>
                  </div>
                )}

                {selectedEventType.description && (
                  <p className="text-xs text-gray-400 leading-relaxed mt-1">{selectedEventType.description}</p>
                )}

                {/* User info */}
                <div className="mt-auto flex items-center gap-2.5 pt-4 border-t border-gray-100">
                  <UserAvatar name={publicUser.name} color={publicUser.avatar_color} size="sm" />
                  <span className="text-sm text-gray-600">{publicUser.name}</span>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="flex-1 flex flex-col divide-y divide-gray-100">
                {/* Calendar */}
                <div className="p-6">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={prevMonth}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="font-semibold text-gray-800 text-sm">
                      {monthNames[calMonth]} {calYear}
                    </span>
                    <button
                      onClick={nextMonth}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {weeks.flat().map((cell, i) => {
                      const clickable = isDayClickable(cell);
                      const isSelected = cell.date === selectedDate;
                      const isToday = cell.date === todayStr;

                      return (
                        <button
                          key={i}
                          disabled={!clickable}
                          onClick={() => clickable && handleDateClick(cell.date)}
                          className={[
                            'relative mx-auto w-9 h-9 rounded-full text-sm font-medium transition-colors flex items-center justify-center',
                            !cell.currentMonth
                              ? 'text-gray-200 cursor-default'
                              : !clickable
                              ? 'text-gray-300 cursor-not-allowed'
                              : isSelected
                              ? 'bg-monday-blue text-white'
                              : isToday
                              ? 'border border-monday-blue text-monday-blue hover:bg-blue-50'
                              : 'text-gray-700 hover:bg-gray-100',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time slots */}
                <div className="p-6 flex-1">
                  {!selectedDate ? (
                    <p className="text-sm text-gray-400 text-center mt-4">
                      Select a date to see available times
                    </p>
                  ) : loadingSlots ? (
                    <Spinner />
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center mt-4">
                      No available times on this day
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {slots.map((slot, i) => {
                          const isSelected =
                            selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedSlot(slot);
                                setStep('form');
                              }}
                              className={[
                                'py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                                isSelected
                                  ? 'bg-monday-blue text-white border-monday-blue'
                                  : 'border-gray-200 text-gray-700 hover:border-monday-blue hover:text-monday-blue',
                              ].join(' ')}
                            >
                              {formatSlotTime(slot.start, guestTimezone)}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400">
                        Times shown in your local timezone ({guestTimezone})
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 3 — Guest details form ─────────────────────────────────────
  if (step === 'form' && selectedEventType && selectedSlot) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {/* Back */}
            <button
              onClick={() => setStep('datetime')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
            >
              <ChevronLeft size={16} />
              Back
            </button>

            {/* Summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEventType.color }} />
                <span className="font-semibold text-gray-900">{selectedEventType.name}</span>
                <span className="text-xs text-gray-400 ml-auto">{selectedEventType.duration_minutes} min</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <Calendar size={15} className="flex-shrink-0 mt-0.5 text-gray-400" />
                <span>
                  {selectedDate ? formatDateLong(selectedSlot.start, guestTimezone) : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mt-1.5">
                <Clock size={15} className="flex-shrink-0 text-gray-400" />
                <span>
                  {formatSlotTime(selectedSlot.start, guestTimezone)}
                  {' – '}
                  {formatSlotTime(selectedSlot.end, guestTimezone)}
                  <span className="text-gray-400 text-xs ml-1">({guestTimezone})</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mt-1.5">
                <UserAvatar name={publicUser.name} color={publicUser.avatar_color} size="sm" />
                <span>{publicUser.name}</span>
              </div>
            </div>

            {/* Form */}
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Your details</h2>
            <form onSubmit={handleBook} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phone <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    WhatsApp <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={guestWhatsapp}
                    onChange={e => setGuestWhatsapp(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Telegram <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={guestTelegram}
                    onChange={e => setGuestTelegram(e.target.value)}
                    placeholder="@username"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={guestNotes}
                  onChange={e => setGuestNotes(e.target.value)}
                  placeholder="Anything to share before we meet?"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: selectedEventType.color || '#0073ea' }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Confirming…
                  </>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER: Step 4 — Confirmed ──────────────────────────────────────────────
  if (step === 'confirmed' && booking && selectedEventType && selectedSlot) {
    const gcalUrl = buildGoogleCalendarUrl({
      title: `${selectedEventType.name} with ${publicUser.name}`,
      startISO: booking.start_time,
      endISO: booking.end_time,
      location: selectedEventType.location,
      description: `Booked via ${publicUser.name}'s scheduling page.`,
    });

    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            {/* Checkmark */}
            <div className="flex justify-center mb-5">
              <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle size={44} className="text-monday-green" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1">You're booked!</h1>
            <p className="text-gray-500 text-sm mb-8">
              A confirmation has been sent to{' '}
              <span className="font-medium text-gray-700">{booking.guest_email}</span>
            </p>

            {/* Summary card */}
            <div className="text-left rounded-xl bg-gray-50 border border-gray-100 p-5 mb-8 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedEventType.color }} />
                <span className="font-semibold text-gray-900">{selectedEventType.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <UserAvatar name={publicUser.name} color={publicUser.avatar_color} size="sm" />
                <span>with {publicUser.name}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <Calendar size={15} className="flex-shrink-0 mt-0.5 text-gray-400" />
                <span>{formatDateLong(booking.start_time, guestTimezone)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock size={15} className="flex-shrink-0 text-gray-400" />
                <span>
                  {formatSlotTime(booking.start_time, guestTimezone)}
                  {' – '}
                  {formatSlotTime(booking.end_time, guestTimezone)}
                  <span className="text-gray-400 text-xs ml-1">({guestTimezone})</span>
                </span>
              </div>
              {selectedEventType.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <LocationIcon location={selectedEventType.location} />
                  <span>{selectedEventType.location}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <a
                href={gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <Calendar size={16} className="text-google-blue" />
                Add to Google Calendar
              </a>

              <button
                onClick={resetAll}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium text-monday-blue hover:bg-blue-50 transition-colors"
              >
                Book another time
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (shouldn't happen)
  return null;
}
