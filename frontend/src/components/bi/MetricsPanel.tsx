import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Sigma, Calculator, Hash, HelpCircle, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import biApi, { BiMetric, BiColumn } from '../../api/bi';
import { useBiStore } from '../../store/biStore';
import { AGG_FUNCTIONS, FILTER_OPS, formatNumber } from './biUtils';

// Mirror the backend's sanitizeKey so the tokens we show match what formulas use.
const tokenize = (s: string) => String(s).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');

const blank = {
  name: '', description: '', kind: 'aggregate' as 'aggregate' | 'calculated',
  source_type: 'datasource' as 'datasource' | 'manual' | 'combined', source_id: '', fn: 'sum', field: '',
  filters: [] as any[], expression: '',
};

export default function MetricsPanel() {
  const { metrics, datasources, manualDatasets, combined, loadMetrics, loadDatasources, loadManual, loadCombined } = useBiStore();
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { loadMetrics(); loadDatasources(); loadManual(); loadCombined(); refreshValues(); }, []);
  const refreshValues = () => biApi.metricValues().then(setValues).catch(() => {});

  const set = (patch: any) => setForm((f) => ({ ...f, ...patch }));

  const datasetsFor = (t: string) => (t === 'datasource' ? datasources : t === 'combined' ? combined : manualDatasets);
  const columns: BiColumn[] = useMemo(() => {
    if (form.source_type === 'datasource') return datasources.find((d) => d.id === form.source_id)?.column_meta || [];
    if (form.source_type === 'combined') return (combined.find((d) => d.id === form.source_id)?.columns || []) as BiColumn[];
    return manualDatasets.find((d) => d.id === form.source_id)?.columns || [];
  }, [form.source_type, form.source_id, datasources, manualDatasets, combined]);

  const reset = () => { setForm({ ...blank }); setEditingId(null); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Give the measure a name');
    try {
      const body: any = {
        name: form.name.trim(), description: form.description, kind: form.kind,
      };
      if (form.kind === 'aggregate') {
        if (!form.source_id) return toast.error('Pick a dataset');
        if (!form.field && form.fn !== 'count_all') return toast.error('Pick a field');
        Object.assign(body, { source_type: form.source_type, source_id: form.source_id, fn: form.fn, field: form.field, filters: form.filters });
      } else {
        if (!form.expression.trim()) return toast.error('Enter an expression');
        body.expression = form.expression.trim();
      }
      if (editingId) { await biApi.updateMetric(editingId, body); toast.success('Measure updated'); }
      else { await biApi.createMetric(body); toast.success('Measure created'); }
      reset(); await loadMetrics(); refreshValues();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
  };

  const edit = (m: BiMetric) => {
    setEditingId(m.id);
    setForm({
      name: m.name, description: m.description || '', kind: m.kind || 'aggregate',
      source_type: (m.source_type as any) || 'datasource', source_id: m.source_id || '',
      fn: m.fn || 'sum', field: m.field || '', filters: m.filters || [], expression: m.expression || '',
    });
  };

  const remove = async (id: string) => { await biApi.deleteMetric(id); if (editingId === id) reset(); await loadMetrics(); refreshValues(); };

  const datasetName = (m: BiMetric) =>
    (datasetsFor(m.source_type || 'datasource') as any[]).find((d) => d.id === m.source_id)?.name || '—';

  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  const lbl = 'block text-xs font-medium text-gray-500 mb-1';
  const filters = form.filters;
  const setFilters = (f: any[]) => set({ filters: f });

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm text-gray-500 max-w-2xl">
          A <strong>measure</strong> is a reusable number computed from a dataset — e.g. <em>Total Clients = count of distinct <code>clientID</code></em>.
          Use measures in KPI widgets, or combine them in a calculated measure.
        </p>
        <button onClick={() => setShowHelp((s) => !s)} className="flex items-center gap-1 text-sm text-blue-600 whitespace-nowrap"><HelpCircle size={15} /> Formula help</button>
      </div>

      {showHelp && <CheatSheet />}

      {/* Builder */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-700">{editingId ? 'Edit measure' : 'New measure'}</h3>
          <div className="flex-1" />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => set({ kind: 'aggregate' })} className={`px-3 py-1.5 flex items-center gap-1 ${form.kind === 'aggregate' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}><Hash size={12} /> Aggregate</button>
            <button onClick={() => set({ kind: 'calculated' })} className={`px-3 py-1.5 flex items-center gap-1 ${form.kind === 'calculated' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}><Calculator size={12} /> Calculated</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div><label className={lbl}>Name</label><input className={inp} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Total Clients" /></div>
          <div className="col-span-2"><label className={lbl}>Description (optional)</label><input className={inp} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
        </div>

        {form.kind === 'aggregate' ? (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div><label className={lbl}>Dataset type</label>
                <select className={inp} value={form.source_type} onChange={(e) => set({ source_type: e.target.value, source_id: '', field: '' })}>
                  <option value="datasource">Google / Drive</option><option value="manual">Manual / uploaded</option><option value="combined">Combined (joined)</option>
                </select>
              </div>
              <div><label className={lbl}>Dataset</label>
                <select className={inp} value={form.source_id} onChange={(e) => set({ source_id: e.target.value, field: '' })}>
                  <option value="">— select —</option>
                  {datasetsFor(form.source_type).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Function</label>
                <select className={inp} value={form.fn} onChange={(e) => set({ fn: e.target.value })}>
                  {AGG_FUNCTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Field</label>
                <select className={inp} value={form.field} onChange={(e) => set({ field: e.target.value })}>
                  <option value="">— select —</option>
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Reads like: <strong>{AGG_FUNCTIONS.find((f) => f.value === form.fn)?.label || form.fn}</strong> of <strong>{form.field || '(field)'}</strong>
              {filters.length ? ` where ${filters.length} filter(s) match` : ''}. For unique clients use <strong>Count distinct</strong>.
            </p>

            <details className="mt-3 border border-gray-200 rounded-lg p-3">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer">Filters (optional)</summary>
              {filters.map((f: any, i: number) => (
                <div key={i} className="flex gap-2 mt-2">
                  <select className={inp} value={f.field || ''} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], field: e.target.value }; setFilters(n); }}>
                    <option value="">field</option>{columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <select className={inp} value={f.op || 'eq'} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], op: e.target.value }; setFilters(n); }}>
                    {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className={inp} placeholder="value" value={f.value ?? ''} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], value: e.target.value }; setFilters(n); }} />
                  <button onClick={() => setFilters(filters.filter((_: any, j: number) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => setFilters([...filters, { field: columns[0]?.name || '', op: 'eq', value: '' }])} className="text-xs text-blue-600 flex items-center gap-1 mt-2"><Plus size={12} /> Add filter</button>
            </details>
          </>
        ) : (
          <>
            <label className={lbl}>Expression (combine other measures + math)</label>
            <input className={`${inp} font-mono`} value={form.expression} onChange={(e) => set({ expression: e.target.value })} placeholder="(Total_Revenue - Total_Cost) / Total_Revenue * 100" />
            {metrics.filter((m) => m.kind === 'aggregate').length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Click to insert a measure:&nbsp;
                {metrics.filter((m) => m.kind === 'aggregate').map((m) => (
                  <button key={m.id} onClick={() => set({ expression: form.expression + tokenize(m.name) })}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 m-0.5 bg-gray-100 hover:bg-blue-100 rounded font-mono">{tokenize(m.name)}</button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={14} /> {editingId ? 'Update measure' : 'Create measure'}</button>
          {editingId && <button onClick={reset} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg">
            {m.kind === 'calculated' ? <Calculator size={16} className="text-purple-500" /> : <Sigma size={16} className="text-blue-500" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                {m.name}
                <code className="text-[11px] text-gray-400 font-mono">{tokenize(m.name)}</code>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {m.kind === 'aggregate'
                  ? `${AGG_FUNCTIONS.find((f) => f.value === m.fn)?.label || m.fn} of ${m.field} · ${datasetName(m)}`
                  : <code>{m.expression}</code>}
              </div>
            </div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{values[m.id] != null ? formatNumber(values[m.id]) : '—'}</div>
            <button onClick={() => edit(m)} className="p-2 text-gray-400 hover:text-gray-700"><Pencil size={15} /></button>
            <button onClick={() => remove(m.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
          </div>
        ))}
        {!metrics.length && <p className="text-sm text-gray-400">No measures yet. Create one above — e.g. count of distinct clientID.</p>}
      </div>
    </div>
  );
}

function CheatSheet() {
  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-gray-700 space-y-2">
      <div className="font-semibold text-gray-800">How measures work</div>
      <p><strong>Aggregate</strong> = one function applied to a column of a dataset:</p>
      <ul className="list-disc ml-5 text-xs space-y-0.5 text-gray-600">
        <li><strong>Count distinct</strong> of <code>clientID</code> → number of unique clients</li>
        <li><strong>Count</strong> of <code>orderID</code> → number of orders (non-empty rows)</li>
        <li><strong>Sum</strong> of <code>revenue</code> · <strong>Average</strong> of <code>price</code> · <strong>Min/Max/Median</strong> of any numeric column</li>
      </ul>
      <p><strong>Calculated</strong> = math over other measures (reference them by the grey <code>token</code> shown on each):</p>
      <ul className="list-disc ml-5 text-xs space-y-0.5 text-gray-600">
        <li><code>Total_Revenue - Total_Cost</code> → profit</li>
        <li><code>(Total_Revenue - Total_Cost) / Total_Revenue * 100</code> → margin %</li>
        <li>Operators: <code>+ - * / %</code> · functions: <code>abs() round() min() max() if(cond, a, b)</code></li>
      </ul>
      <p className="text-xs text-gray-500">Note: counts/sums/averages for a single chart can also be set directly in a widget — measures are for reuse and KPI cards.</p>
    </div>
  );
}
