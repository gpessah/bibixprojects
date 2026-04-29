import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useBoardStore } from '../../store/boardStore';
import type { Item } from '../../types';
import ItemModal from './ItemModal';

export default function CalendarView() {
  const { board, getValue, addItem, updateItemValue } = useBoardStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [createState, setCreateState] = useState<{ date: Date; name: string; groupId: string } | null>(null);
  const [creating, setCreating] = useState(false);

  if (!board) return null;

  const dateCol   = board.columns.find(c => c.type === 'date');
  const statusCol = board.columns.find(c => c.type === 'status');

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end:   endOfWeek(endOfMonth(currentDate)),
  });

  const getItemsForDay = (day: Date): Item[] => {
    if (!dateCol) return [];
    return board.items.filter(item => {
      if (item.parent_item_id) return false;
      const val = getValue(item.id, dateCol.id);
      if (!val) return false;
      try { return format(parseISO(val), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'); }
      catch { return false; }
    });
  };

  const getStatusColor = (item: Item) => {
    if (!statusCol) return '#0073ea';
    const val = getValue(item.id, statusCol.id);
    const opt = statusCol.settings?.options?.find(o => o.label === val);
    return opt?.color || '#c4c4c4';
  };

  const handleCreate = async () => {
    if (!createState?.name.trim() || !dateCol) return;
    setCreating(true);
    try {
      const item = await addItem(createState.groupId, createState.name.trim());
      await updateItemValue(item.id, dateCol.id, format(createState.date, 'yyyy-MM-dd'));
      setCreateState(null);
    } finally { setCreating(false); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-600">Today</button>
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
        </div>
      </div>

      {!dateCol && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          This board has no date column. Add a <strong className="mx-1">Date</strong> column to use calendar view.
        </div>
      )}

      {dateCol && (
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden flex-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-gray-50 text-center py-2 text-xs font-semibold text-gray-500">{d}</div>
          ))}
          {days.map(day => {
            const dayItems = getItemsForDay(day);
            const inMonth  = isSameMonth(day, currentDate);
            const today    = isToday(day);
            return (
              <div key={day.toISOString()}
                className={`bg-white p-2 min-h-[110px] group relative ${!inMonth ? 'opacity-40' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                    ${today ? 'bg-monday-blue text-white' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </div>
                  {inMonth && (
                    <button
                      onClick={() => setCreateState({ date: day, name: '', groupId: board.groups[0]?.id || '' })}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-monday-blue transition-opacity"
                      title="Add task">
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(item => (
                    <div key={item.id} onClick={() => setSelectedItem(item)}
                      className="px-2 py-0.5 rounded text-xs text-white font-medium cursor-pointer hover:opacity-80 truncate"
                      style={{ backgroundColor: getStatusColor(item) }}>
                      {item.name}
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-xs text-gray-400 px-1">+{dayItems.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* Quick-create task on a day */}
      {createState && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateState(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">
              New task — {format(createState.date, 'MMM d, yyyy')}
            </h3>
            <input
              autoFocus
              value={createState.name}
              onChange={e => setCreateState(s => s ? { ...s, name: e.target.value } : s)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Task name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue"
            />
            {board.groups.length > 1 && (
              <select
                value={createState.groupId}
                onChange={e => setCreateState(s => s ? { ...s, groupId: e.target.value } : s)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue">
                {board.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreateState(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !createState.name.trim()}
                className="px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-60">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
