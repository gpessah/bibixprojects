import { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, FileText, Users, Plus, Trash2, ChevronDown } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface CalConn { id: string; provider: 'google' | 'microsoft'; calendar_email: string; }

interface Props {
  defaultDate?: Date;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateEventModal({ defaultDate, onClose, onCreated }: Props) {
  const defaultDateStr = defaultDate ? format(defaultDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  const [connections, setConnections] = useState<CalConn[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>('');
  const [title, setTitle]               = useState('');
  const [date, setDate]                 = useState(defaultDateStr);
  const [startTime, setStartTime]       = useState('09:00');
  const [endTime, setEndTime]           = useState('10:00');
  const [allDay, setAllDay]             = useState(false);
  const [location, setLocation]         = useState('');
  const [description, setDescription]   = useState('');
  const [attendees, setAttendees]       = useState<string[]>([]);
  const [newEmail, setNewEmail]         = useState('');
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    api.get('/calendar/status').then(r => {
      const all: CalConn[] = [
        ...(r.data.google    || []).map((c: CalConn) => ({ ...c, provider: 'google'    as const })),
        ...(r.data.microsoft || []).map((c: CalConn) => ({ ...c, provider: 'microsoft' as const })),
      ];
      setConnections(all);
      if (all.length > 0) setSelectedConnId(all[0].id);
    }).catch(() => {});
  }, []);

  const selectedConn = connections.find(c => c.id === selectedConnId);

  const addAttendee = () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { toast.error('Enter a valid email'); return; }
    if (attendees.includes(newEmail.trim())) return;
    setAttendees(a => [...a, newEmail.trim()]);
    setNewEmail('');
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Please enter a title'); return; }
    if (!selectedConnId) { toast.error('Please connect a calendar first'); return; }
    setSaving(true);
    try {
      const start = allDay ? date : `${date}T${startTime}:00`;
      const end   = allDay ? date : `${date}T${endTime}:00`;
      await api.post('/calendar/events', { title: title.trim(), start, end, allDay, location, description, attendees, connId: selectedConnId });
      toast.success('Event created!');
      onCreated();
      onClose();
    } catch {
      toast.error('Failed to create event.');
    } finally { setSaving(false); }
  };

  const providerLabel = (p: string) => p === 'google' ? 'Google Calendar' : 'Outlook / Microsoft 365';
  const providerColor = (p: string) => p === 'google' ? '#1a73e8' : '#0078d4';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-lg">Create Event</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Calendar selector */}
          {connections.length > 0 && (
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Add to calendar</label>
                <div className="relative">
                  <select
                    value={selectedConnId}
                    onChange={e => setSelectedConnId(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue pr-8 cursor-pointer"
                    style={{ color: selectedConn ? providerColor(selectedConn.provider) : undefined }}
                  >
                    {connections.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.calendar_email} — {providerLabel(c.provider)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {connections.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              No calendar connected. Go to <a href="/settings" className="underline font-medium">Settings</a> to connect Google or Outlook.
            </div>
          )}

          {/* Title */}
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title"
            autoFocus
            className="w-full text-lg font-medium border-0 border-b-2 border-gray-200 focus:border-monday-blue pb-2 outline-none placeholder-gray-300" />

          {/* All day toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
            All day
          </label>

          {/* Date & Time */}
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar size={16} className="text-gray-400 flex-shrink-0" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
            {!allDay && (
              <>
                <Clock size={16} className="text-gray-400 flex-shrink-0" />
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
                <span className="text-gray-400 text-sm">→</span>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
              </>
            )}
          </div>

          {/* Location */}
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-gray-400 flex-shrink-0" />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Add location (optional)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
          </div>

          {/* Description */}
          <div className="flex items-start gap-3">
            <FileText size={16} className="text-gray-400 flex-shrink-0 mt-2" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add description (optional)"
              rows={2} className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue resize-none" />
          </div>

          {/* Attendees */}
          <div className="flex items-start gap-3">
            <Users size={16} className="text-gray-400 flex-shrink-0 mt-2" />
            <div className="flex-1 space-y-2">
              {attendees.map(email => (
                <div key={email} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="flex-1 text-sm text-gray-700">{email}</span>
                  <button onClick={() => setAttendees(a => a.filter(e => e !== email))} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAttendee()}
                  placeholder="Add attendee email"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
                <button onClick={addAttendee} className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200"><Plus size={14} /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving || !selectedConnId}
            className="px-5 py-2 bg-monday-blue text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-60">
            {saving ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
