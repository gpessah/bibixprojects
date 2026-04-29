import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isToday, parseISO, startOfWeek, endOfWeek,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  SlidersHorizontal, Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import CreateEventModal from '../components/board/CreateEventModal';

interface CalConn { id: string; provider: string; calendar_email: string; }
interface GoogleEvent {
  id: string; summary?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  htmlLink?: string;
  _provider?: string; _accountEmail?: string; _connId?: string;
}
interface BoardTask {
  id: string; name: string; board_id: string; board_name: string; board_icon: string;
  date_value: string;
}

const PROVIDER_COLOR: Record<string, string> = { google: '#1a73e8', microsoft: '#0078d4' };
const BOARD_PALETTE = [
  '#0073ea', '#00c875', '#e2445c', '#fdab3d', '#a25ddc',
  '#037f4c', '#ff158a', '#0086c0', '#7f5347', '#00b0a7',
];

export default function CalendarPage() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate]     = useState(new Date());
  const [connections, setConnections]     = useState<CalConn[]>([]);
  const [allEvents, setAllEvents]         = useState<GoogleEvent[]>([]);
  const [boardTasks, setBoardTasks]       = useState<BoardTask[]>([]);
  const [loading, setLoading]             = useState(false);
  const [showFilter, setShowFilter]       = useState(false);
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [createDate, setCreateDate]       = useState<Date | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Load connections once
  useEffect(() => {
    api.get('/calendar/status').then(r => {
      const all: CalConn[] = [
        ...(r.data.google    || []).map((c: CalConn) => ({ ...c, provider: 'google' })),
        ...(r.data.microsoft || []).map((c: CalConn) => ({ ...c, provider: 'microsoft' })),
      ];
      setConnections(all);
    }).catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const rangeStart = startOfWeek(startOfMonth(currentDate));
      const rangeEnd   = endOfWeek(endOfMonth(currentDate));
      const startStr   = format(rangeStart, 'yyyy-MM-dd');
      const endStr     = format(rangeEnd,   'yyyy-MM-dd');

      const [tasksRes, eventsRes] = await Promise.allSettled([
        api.get(`/calendar/board-tasks?start=${startStr}&end=${endStr}`),
        connections.length > 0
          ? api.get(`/calendar/events?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`)
          : Promise.resolve({ data: [] }),
      ]);

      setBoardTasks(tasksRes.status === 'fulfilled' ? tasksRes.value.data : []);
      setAllEvents(eventsRes.status === 'fulfilled' ? eventsRes.value.data : []);
    } finally { setLoading(false); }
  }, [currentDate, connections]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilter) return;
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showFilter]);

  // Assign a stable colour to each board from the palette
  const boardColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const seen: string[] = [];
    boardTasks.forEach(t => {
      if (!map[t.board_id]) {
        map[t.board_id] = BOARD_PALETTE[seen.length % BOARD_PALETTE.length];
        seen.push(t.board_id);
      }
    });
    return map;
  }, [boardTasks]);

  // Unique boards for the filter panel
  const uniqueBoards = useMemo(() => {
    const seen = new Set<string>();
    return boardTasks.filter(t => { if (seen.has(t.board_id)) return false; seen.add(t.board_id); return true; });
  }, [boardTasks]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end:   endOfWeek(endOfMonth(currentDate)),
  });

  const getTasksForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return boardTasks.filter(t => {
      if (hiddenSources.has(t.board_id)) return false;
      try { return format(parseISO(t.date_value), 'yyyy-MM-dd') === dayStr; }
      catch { return false; }
    });
  };

  const getEventsForDay = (day: Date): GoogleEvent[] => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return allEvents.filter(ev => {
      if (ev._connId && hiddenSources.has(ev._connId)) return false;
      const d = ev.start.dateTime ? format(parseISO(ev.start.dateTime), 'yyyy-MM-dd') : ev.start.date;
      return d === dayStr;
    });
  };

  const formatEventTime = (ev: GoogleEvent) =>
    ev.start.dateTime ? format(parseISO(ev.start.dateTime), 'h:mm a') : 'All day';

  const toggleSource = (key: string) =>
    setHiddenSources(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const totalVisible = connections.length + uniqueBoards.length;
  const totalHidden  = hiddenSources.size;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
          {loading && <div className="w-4 h-4 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />}

          {/* Filter button */}
          {totalVisible > 0 && (
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilter(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${showFilter || totalHidden > 0
                    ? 'border-monday-blue text-monday-blue bg-blue-50'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <SlidersHorizontal size={13} />
                Calendars
                {totalHidden > 0 && (
                  <span className="bg-monday-blue text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                    {totalHidden} hidden
                  </span>
                )}
              </button>

              {showFilter && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-50 w-72 space-y-1">
                  <p className="text-xs text-gray-400 font-medium px-2 mb-2">Show / hide sources</p>

                  {/* Board rows */}
                  {uniqueBoards.map(t => {
                    const visible = !hiddenSources.has(t.board_id);
                    const color   = boardColorMap[t.board_id];
                    return (
                      <button key={t.board_id} onClick={() => toggleSource(t.board_id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 text-left">
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${visible ? '' : 'border border-gray-300'}`}
                          style={visible ? { backgroundColor: color } : {}}>
                          {visible && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-base leading-none">{t.board_icon}</span>
                        <span className="text-sm text-gray-700 flex-1 truncate">{t.board_name}</span>
                      </button>
                    );
                  })}

                  {/* Divider between boards and calendars */}
                  {uniqueBoards.length > 0 && connections.length > 0 && (
                    <div className="border-t border-gray-100 my-1" />
                  )}

                  {/* Calendar account rows */}
                  {connections.map(conn => {
                    const visible = !hiddenSources.has(conn.id);
                    const color   = PROVIDER_COLOR[conn.provider] || '#666';
                    return (
                      <button key={conn.id} onClick={() => toggleSource(conn.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 text-left">
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${visible ? '' : 'border border-gray-300'}`}
                          style={visible ? { backgroundColor: color } : {}}>
                          {visible && <Check size={10} className="text-white" />}
                        </div>
                        <CalendarIcon size={12} className="flex-shrink-0" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{conn.calendar_email}</p>
                          <p className="text-xs text-gray-400">
                            {conn.provider === 'google' ? 'Google Calendar' : 'Outlook'}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {connections.length === 0 && uniqueBoards.length === 0 && (
                    <p className="text-xs text-gray-400 px-2 py-1">Nothing to show yet.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-600">Today</button>
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden flex-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-gray-50 text-center py-2 text-xs font-semibold text-gray-500">{d}</div>
        ))}

        {days.map(day => {
          const dayTasks  = getTasksForDay(day);
          const dayEvents = getEventsForDay(day);
          const inMonth   = isSameMonth(day, currentDate);
          const today     = isToday(day);
          const total     = dayTasks.length + dayEvents.length;

          return (
            <div key={day.toISOString()}
              className={`bg-white p-2 min-h-[110px] group relative ${!inMonth ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                  ${today ? 'bg-monday-blue text-white' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </div>
                {/* + button only if a calendar is connected (creates external event) */}
                {inMonth && connections.length > 0 && (
                  <button onClick={() => setCreateDate(day)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-monday-blue transition-opacity"
                    title="Create calendar event">
                    <Plus size={13} />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {/* Board tasks (up to 2) */}
                {dayTasks.slice(0, 2).map(task => (
                  <div key={task.id}
                    onClick={() => navigate(`/board/${task.board_id}`)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white font-medium cursor-pointer hover:opacity-80 truncate"
                    style={{ backgroundColor: boardColorMap[task.board_id] }}
                    title={`${task.board_name}: ${task.name}`}>
                    <span className="text-[10px] leading-none flex-shrink-0">{task.board_icon}</span>
                    <span className="truncate">{task.name}</span>
                  </div>
                ))}

                {/* External calendar events (fill up to 3 total) */}
                {dayEvents.slice(0, Math.max(0, 3 - dayTasks.length)).map(ev => {
                  const color = PROVIDER_COLOR[ev._provider || 'google'] || '#1a73e8';
                  return (
                    <a key={ev.id} href={ev.htmlLink} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium hover:opacity-80 truncate text-white"
                      style={{ backgroundColor: color }}
                      title={`${ev.summary} (${ev._accountEmail})`}>
                      <CalendarIcon size={9} className="flex-shrink-0" />
                      <span className="truncate">{formatEventTime(ev)} {ev.summary}</span>
                    </a>
                  );
                })}

                {total > 3 && (
                  <div className="text-xs text-gray-400 px-1">+{total - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create external event */}
      {createDate && (
        <CreateEventModal
          defaultDate={createDate}
          onClose={() => setCreateDate(null)}
          onCreated={fetchAll}
        />
      )}
    </div>
  );
}
