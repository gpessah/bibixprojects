import { useEffect, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Plus, Palette, Pencil, Check, RefreshCw, Minus, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import biApi, { BiWidget, BiTheme } from '../../api/bi';
import { useBiStore } from '../../store/biStore';
import WidgetCard from './WidgetCard';
import WidgetEditor from './WidgetEditor';
import ThemePanel from './ThemePanel';
import DashboardFilterBar, { FilterDef, clausesForSource } from './DashboardFilterBar';
import { WIDGET_TYPES } from './biUtils';

const ROW_H = 70; // px per layout height unit

function SortableWidget({ widget, theme, editMode, version, runtimeFilters, onEdit, onDelete, onResize }: {
  widget: BiWidget; theme: BiTheme; editMode: boolean; version: number; runtimeFilters: any[];
  onEdit: () => void; onDelete: () => void; onResize: (w: number, h: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editMode });
  const w = Math.min(12, Math.max(2, widget.layout?.w || 6));
  const h = Math.max(2, widget.layout?.h || 4);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    gridColumn: `span ${w}`, height: h * ROW_H, opacity: isDragging ? 0.5 : 1, position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style}>
      <WidgetCard widget={widget} theme={theme} editMode={editMode} version={version} runtimeFilters={runtimeFilters}
        dragHandleProps={{ ...attributes, ...listeners }} onEdit={onEdit} onDelete={onDelete} />
      {editMode && (
        <div className="absolute -bottom-2 right-1 flex gap-1 bg-white border border-gray-200 rounded-md shadow-sm px-1 py-0.5">
          <button onClick={() => onResize(Math.max(2, w - 1), h)} className="text-gray-400 hover:text-gray-700" title="Narrower"><Minus size={12} /></button>
          <span className="text-[10px] text-gray-400">{w}×{h}</span>
          <button onClick={() => onResize(Math.min(12, w + 1), h)} className="text-gray-400 hover:text-gray-700" title="Wider"><Plus size={12} /></button>
          <button onClick={() => onResize(w, h + 1)} className="text-gray-400 hover:text-gray-700 ml-1" title="Taller"><Maximize2 size={12} /></button>
          <button onClick={() => onResize(w, Math.max(2, h - 1))} className="text-gray-400 hover:text-gray-700" title="Shorter"><Minus size={12} /></button>
        </div>
      )}
    </div>
  );
}

export default function DashboardView({ dashboardId, onBack }: { dashboardId: string; onBack: () => void }) {
  const { current, openDashboard, patchCurrent, setWidgets, upsertWidget, removeWidget, loadDashboards } = useBiStore();
  const [editMode, setEditMode] = useState(false);
  const [editingWidget, setEditingWidget] = useState<BiWidget | null>(null);
  const [showTheme, setShowTheme] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [version, setVersion] = useState(0);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { openDashboard(dashboardId); }, [dashboardId]);

  if (!current || current.id !== dashboardId) {
    return <div className="p-10 text-center text-gray-400">Loading dashboard…</div>;
  }
  const theme = current.theme || {};
  const widgets = current.widgets || [];
  const filterDefs: FilterDef[] = (current.layout?.filters as FilterDef[]) || [];

  const saveFilterDefs = (defs: FilterDef[]) => {
    const layout = { ...(current.layout || {}), filters: defs };
    patchCurrent({ layout });
    biApi.updateDashboard(current.id, { layout }).catch(() => {});
  };

  const persistLayout = (list: BiWidget[]) => {
    biApi.saveLayout(current.id, list.map((w, i) => ({ id: w.id, layout: w.layout, position: i }))).catch(() => {});
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = widgets.findIndex((w) => w.id === active.id);
    const newI = widgets.findIndex((w) => w.id === over.id);
    const reordered = arrayMove(widgets, oldI, newI);
    setWidgets(reordered);
    persistLayout(reordered);
  };

  const resizeWidget = (widget: BiWidget, w: number, h: number) => {
    const layout = { ...widget.layout, w, h };
    const updated = { ...widget, layout };
    upsertWidget(updated);
    biApi.updateWidget(widget.id, { layout }).catch(() => {});
  };

  const addWidget = async (type: string) => {
    setShowAdd(false);
    const def = WIDGET_TYPES.find((t) => t.value === type);
    const w = await biApi.addWidget(current.id, { type, title: def?.label || 'Widget', layout: { w: type === 'kpi' ? 3 : 6, h: type === 'kpi' ? 2 : 4 } });
    upsertWidget(w);
    setEditingWidget(w);
  };

  const saveTheme = (t: BiTheme) => { patchCurrent({ theme: t }); biApi.updateDashboard(current.id, { theme: t }).catch(() => {}); };

  const deleteWidget = async (id: string) => {
    removeWidget(id);
    await biApi.deleteWidget(id).catch(() => {});
  };

  const rename = (name: string) => { patchCurrent({ name }); biApi.updateDashboard(current.id, { name }).then(loadDashboards).catch(() => {}); };

  return (
    <div className="flex flex-col h-full" style={{ background: theme.background || '#f8fafc', fontFamily: theme.font || 'Inter' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur border-b border-gray-200 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft size={18} /></button>
        {editMode
          ? <input className="text-lg font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:outline-none focus:border-blue-500" value={current.name} onChange={(e) => rename(e.target.value)} />
          : <h1 className="text-lg font-bold text-gray-900">{current.name}</h1>}
        <div className="flex-1" />
        <button onClick={() => setVersion((v) => v + 1)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><RefreshCw size={15} /> Refresh</button>
        {editMode && <>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={15} /> Add widget</button>
          <button onClick={() => setShowTheme(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><Palette size={15} /> Theme</button>
        </>}
        <button onClick={() => setEditMode((e) => !e)} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${editMode ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
          {editMode ? <><Check size={15} /> Done</> : <><Pencil size={15} /> Edit</>}
        </button>
      </div>

      {/* Filter bar */}
      <DashboardFilterBar filters={filterDefs} values={filterValues} editMode={editMode}
        onValues={setFilterValues} onChangeDefs={saveFilterDefs} />

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-5">
        {!widgets.length && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <p className="mb-3">This dashboard is empty.</p>
            <button onClick={() => { setEditMode(true); setShowAdd(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-2"><Plus size={16} /> Add your first widget</button>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-4 auto-rows-min">
              {widgets.map((w) => (
                <SortableWidget key={w.id} widget={w} theme={theme} editMode={editMode} version={version}
                  runtimeFilters={clausesForSource(filterDefs, filterValues, w.source_type, w.source_id || undefined)}
                  onEdit={() => setEditingWidget(w)} onDelete={() => deleteWidget(w.id)}
                  onResize={(cw, ch) => resizeWidget(w, cw, ch)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {editingWidget && <WidgetEditor widget={editingWidget} onClose={() => setEditingWidget(null)} onSaved={(w) => { upsertWidget(w); setVersion((v) => v + 1); }} />}
      {showTheme && <ThemePanel theme={theme} onChange={saveTheme} onClose={() => setShowTheme(false)} />}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-2xl p-5 w-[480px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Add a widget</h3>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TYPES.map((t) => (
                <button key={t.value} onClick={() => addWidget(t.value)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-center">
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-xs text-gray-600">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
