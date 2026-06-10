import { useEffect, useState } from 'react';
import { Plus, X, Filter, RotateCcw } from 'lucide-react';
import biApi from '../../api/bi';
import { useBiStore } from '../../store/biStore';

// A dashboard-level filter definition (persisted in dashboard.layout.filters).
export interface FilterDef {
  id: string;
  label: string;
  sourceType: 'datasource' | 'manual';
  sourceId: string;
  field: string;
  control: 'select' | 'multiselect' | 'daterange' | 'text';
}

interface Props {
  filters: FilterDef[];
  values: Record<string, any>;
  editMode: boolean;
  onValues: (v: Record<string, any>) => void;
  onChangeDefs: (defs: FilterDef[]) => void;
}

// Turn the current filter values into engine clauses, grouped by source so each
// widget only receives clauses for the source it actually reads.
export function clausesForSource(filters: FilterDef[], values: Record<string, any>, sourceType?: string, sourceId?: string) {
  const out: any[] = [];
  for (const f of filters) {
    if (f.sourceType !== sourceType || f.sourceId !== sourceId) continue;
    const v = values[f.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.control === 'multiselect') out.push({ field: f.field, op: 'in', value: v });
    else if (f.control === 'text') out.push({ field: f.field, op: 'contains', value: v });
    else if (f.control === 'daterange') {
      if (v.from) out.push({ field: f.field, op: 'dgte', value: v.from });
      if (v.to) out.push({ field: f.field, op: 'dlte', value: v.to });
    } else out.push({ field: f.field, op: 'eq', value: v });
  }
  return out;
}

export default function DashboardFilterBar({ filters, values, editMode, onValues, onChangeDefs }: Props) {
  const [adding, setAdding] = useState(false);
  if (!filters.length && !editMode) return null;

  const setVal = (id: string, v: any) => onValues({ ...values, [id]: v });
  const reset = () => onValues({});

  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-2 bg-white/70 border-b border-gray-200">
      <Filter size={14} className="text-gray-400" />
      {filters.map((f) => (
        <FilterControl key={f.id} def={f} value={values[f.id]} onChange={(v) => setVal(f.id, v)}
          editMode={editMode} onRemove={() => onChangeDefs(filters.filter((x) => x.id !== f.id))} />
      ))}
      {editMode && (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50">
          <Plus size={12} /> Filter
        </button>
      )}
      {filters.length > 0 && Object.keys(values).length > 0 && (
        <button onClick={reset} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800 ml-auto"><RotateCcw size={12} /> Clear</button>
      )}
      {adding && <AddFilterModal onClose={() => setAdding(false)} onAdd={(d) => { onChangeDefs([...filters, d]); setAdding(false); }} />}
    </div>
  );
}

function FilterControl({ def, value, onChange, editMode, onRemove }: { def: FilterDef; value: any; onChange: (v: any) => void; editMode: boolean; onRemove: () => void }) {
  const [options, setOptions] = useState<string[]>([]);
  const isSelect = def.control === 'select' || def.control === 'multiselect';

  useEffect(() => {
    if (!isSelect) return;
    biApi.query({ source: { type: def.sourceType, id: def.sourceId }, config: { groupBy: [def.field], limit: 1000 } })
      .then((r) => setOptions((r.rows || []).map((row: any) => String(row[def.field] ?? '')).filter(Boolean).sort()))
      .catch(() => setOptions([]));
  }, [def.sourceType, def.sourceId, def.field]);

  const sel = 'px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white';
  return (
    <div className="flex items-center gap-1 bg-gray-50 rounded-lg pl-2 pr-1 py-0.5 border border-gray-200">
      <span className="text-xs font-medium text-gray-500">{def.label}:</span>
      {def.control === 'select' && (
        <select className={sel} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">All</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {def.control === 'multiselect' && (
        <select multiple className={`${sel} h-16`} value={value || []} onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {def.control === 'text' && (
        <input className={sel} placeholder="contains…" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {def.control === 'daterange' && (
        <span className="flex items-center gap-1">
          <input type="date" className={sel} value={value?.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-gray-400 text-xs">–</span>
          <input type="date" className={sel} value={value?.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </span>
      )}
      {editMode && <button onClick={onRemove} className="text-gray-300 hover:text-red-500"><X size={12} /></button>}
    </div>
  );
}

function AddFilterModal({ onClose, onAdd }: { onClose: () => void; onAdd: (d: FilterDef) => void }) {
  const { datasources, manualDatasets } = useBiStore();
  const [sourceType, setSourceType] = useState<'datasource' | 'manual'>('datasource');
  const [sourceId, setSourceId] = useState('');
  const [field, setField] = useState('');
  const [control, setControl] = useState<FilterDef['control']>('select');
  const [label, setLabel] = useState('');

  const columns = sourceType === 'datasource'
    ? (datasources.find((d) => d.id === sourceId)?.column_meta || [])
    : (manualDatasets.find((d) => d.id === sourceId)?.columns || []);

  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  const lbl = 'block text-xs font-medium text-gray-500 mb-1';

  const add = () => {
    if (!sourceId || !field) return;
    onAdd({ id: Math.random().toString(36).slice(2), label: label || field, sourceType, sourceId, field, control });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl p-5 w-[440px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900">Add a filter</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Source type</label>
            <select className={inp} value={sourceType} onChange={(e) => { setSourceType(e.target.value as any); setSourceId(''); setField(''); }}>
              <option value="datasource">Google Sheet</option><option value="manual">Manual dataset</option>
            </select>
          </div>
          <div><label className={lbl}>Source</label>
            <select className={inp} value={sourceId} onChange={(e) => { setSourceId(e.target.value); setField(''); }}>
              <option value="">— select —</option>
              {sourceType === 'datasource' && datasources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              {sourceType === 'manual' && manualDatasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Field</label>
            <select className={inp} value={field} onChange={(e) => { setField(e.target.value); if (!label) setLabel(e.target.value); }}>
              <option value="">— select —</option>
              {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Control</label>
            <select className={inp} value={control} onChange={(e) => setControl(e.target.value as any)}>
              <option value="select">Dropdown</option>
              <option value="multiselect">Multi-select</option>
              <option value="daterange">Date range</option>
              <option value="text">Text search</option>
            </select>
          </div>
        </div>
        <div><label className={lbl}>Label</label><input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Region" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={add} disabled={!sourceId || !field} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Add filter</button>
        </div>
      </div>
    </div>
  );
}
