import { useState } from 'react';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import { useBoardStore } from '../../store/boardStore';
import type { Item, Column } from '../../types';
import ItemModal from './ItemModal';
import StatusCell from '../columns/StatusCell';
import DateCell from '../columns/DateCell';
import PersonCell from '../columns/PersonCell';
import toast from 'react-hot-toast';

export default function KanbanView() {
  const { board, addItem, deleteItem, updateItemValue, getValue, moveItem } = useBoardStore();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [newItemCol, setNewItemCol] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [dragItem, setDragItem] = useState<string | null>(null);

  if (!board) return null;

  const statusCol = board.columns.find(c => c.type === 'status');
  if (!statusCol) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Kanban view requires a Status column
      </div>
    );
  }

  const statusOptions = statusCol.settings?.options || [];
  const allStatuses = [{ label: '', color: '#c4c4c4' }, ...statusOptions];

  const getItemsByStatus = (label: string) =>
    board.items.filter(i => (getValue(i.id, statusCol.id) || '') === label);

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!dragItem) return;
    const item = board.items.find(i => i.id === dragItem);
    if (!item) return;
    await updateItemValue(dragItem, statusCol.id, targetStatus || null);
    setDragItem(null);
    toast.success('Moved');
  };

  const handleAddItem = async (status: string, groupId: string) => {
    if (!newItemName.trim()) { setNewItemCol(null); return; }
    const item = await addItem(groupId, newItemName.trim());
    if (status) await updateItemValue(item.id, statusCol.id, status);
    setNewItemName(''); setNewItemCol(null);
  };

  const defaultGroupId = board.groups[0]?.id;

  const secondaryCol = board.columns.find(c => c.type === 'person');
  const dateCol = board.columns.find(c => c.type === 'date');

  return (
    <div className="flex-1 overflow-x-auto p-6">
      <div className="flex gap-4 min-w-max h-full">
        {allStatuses.map(status => {
          const colItems = getItemsByStatus(status.label);
          const colKey = status.label || '__empty__';

          return (
            <div key={colKey} className="w-72 flex flex-col bg-gray-50 rounded-xl overflow-hidden"
              onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, status.label)}>
              <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-200 bg-white">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: status.color }} />
                <span className="font-semibold text-sm text-gray-700">{status.label || 'No Status'}</span>
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{colItems.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
                {colItems.map(item => (
                  <div key={item.id} draggable onDragStart={() => setDragItem(item.id)} onDragEnd={() => setDragItem(null)}
                    className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab hover:shadow-md transition-shadow group ${dragItem === item.id ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 cursor-pointer hover:text-monday-blue flex-1"
                        onClick={() => setSelectedItem(item)}>
                        {item.name}
                      </span>
                      <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {dateCol && getValue(item.id, dateCol.id) && (
                        <div className="h-6 w-28">
                          <DateCell value={getValue(item.id, dateCol.id)} onChange={v => updateItemValue(item.id, dateCol.id, v)} />
                        </div>
                      )}
                      {secondaryCol && (
                        <div className="h-6 w-8">
                          <PersonCell value={getValue(item.id, secondaryCol.id)} onChange={v => updateItemValue(item.id, secondaryCol.id, v)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {newItemCol === colKey ? (
                  <div className="bg-white rounded-lg p-3 shadow-sm border border-monday-blue">
                    <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddItem(status.label, defaultGroupId); if (e.key === 'Escape') { setNewItemCol(null); setNewItemName(''); } }}
                      onBlur={() => handleAddItem(status.label, defaultGroupId)}
                      placeholder="Item name..." className="w-full text-sm outline-none" />
                  </div>
                ) : (
                  <button onClick={() => { setNewItemCol(colKey); setNewItemName(''); }}
                    className="w-full flex items-center gap-2 text-xs text-gray-400 hover:text-monday-blue py-2 px-1 rounded hover:bg-white">
                    <Plus size={14} /> Add item
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
