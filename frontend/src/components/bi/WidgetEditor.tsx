import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import biApi, { BiWidget } from '../../api/bi';
import { useBiStore } from '../../store/biStore';
import { AGG_FUNCTIONS, WIDGET_TYPES, FILTER_OPS } from './biUtils';
import toast from 'react-hot-toast';

interface Props { widget: BiWidget; onClose: () => void; onSaved: (w: BiWidget) => void; }

const lbl = 'block text-xs font-medium text-gray-500 mb-1';
const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';

export default function WidgetEditor({ widget, onClose, onSaved }: Props) {
  const { datasources, manualDatasets, combined, metrics } = useBiStore();
  const [type, setType] = useState(widget.type);
  const [title, setTitle] = useState(widget.title || '');
  const [sourceType, setSourceType] = useState(widget.source_type);
  const [sourceId, setSourceId] = useState(widget.source_id || '');
  const [cfg, setCfg] = useState<any>({ ...(widget.config || {}) });
  const [saving, setSaving] = useState(false);

  const setC = (patch: any) => setCfg((c: any) => ({ ...c, ...patch }));

  // Columns available from the selected source
  const columns: { name: string; type: string }[] = useMemo(() => {
    if (sourceType === 'datasource') return datasources.find((d) => d.id === sourceId)?.column_meta || [];
    if (sourceType === 'manual') return manualDatasets.find((d) => d.id === sourceId)?.columns || [];
    if (sourceType === 'combined') return combined.find((d) => d.id === sourceId)?.columns || [];
    return [];
  }, [sourceType, sourceId, datasources, manualDatasets, combined]);

  const numCols = columns.filter((c) => c.type === 'number');
  const isChart = ['bar', 'line', 'area', 'combo', 'scatter'].includes(type);
  const isCircular = ['pie', 'funnel', 'treemap'].includes(type);
  const isKpi = type === 'kpi' || type === 'gauge';
  const isPivot = type === 'pivot' || type === 'heatmap';

  const series: any[] = cfg.series || [];
  const setSeries = (s: any[]) => setC({ series: s });

  const filters: any[] = cfg.filters || [];
  const setFilters = (f: any[]) => setC({ filters: f });

  const computed: any[] = cfg.computed || [];
  const setComputed = (c: any[]) => setC({ computed: c });

  const save = async () => {
    setSaving(true);
    try {
      const body = { type, title, source_type: sourceType, source_id: sourceType === 'none' ? null : sourceId, config: cfg };
      await biApi.updateWidget(widget.id, body);
      onSaved({ ...widget, ...body, source_id: body.source_id || undefined } as BiWidget);
      toast.success('Widget saved');
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const colSelect = (value: string, onChange: (v: string) => void, opts = columns, allowEmpty = true) => (
    <select className={inp} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">—</option>}
      {opts.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
    </select>
  );

  return (
    <Modal title="Edit widget" onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Title</label>
            <input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
          </div>
          <div>
            <label className={lbl}>Type</label>
            <select className={inp} value={type} onChange={(e) => setType(e.target.value as any)}>
              {WIDGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Source */}
        {type !== 'text' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Data source type</label>
              <select className={inp} value={sourceType} onChange={(e) => { setSourceType(e.target.value as any); setSourceId(''); }}>
                <option value="none">None</option>
                <option value="datasource">Google / Drive file</option>
                <option value="manual">Manual / uploaded</option>
                <option value="combined">Combined (joined)</option>
                {isKpi && <option value="measure">Saved measure</option>}
              </select>
            </div>
            <div>
              <label className={lbl}>Source</label>
              <select className={inp} value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={sourceType === 'none'}>
                <option value="">— select —</option>
                {sourceType === 'datasource' && datasources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {sourceType === 'manual' && manualDatasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {sourceType === 'combined' && combined.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {sourceType === 'measure' && metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Measure source: the measure already defines what to compute */}
        {isKpi && sourceType === 'measure' && (
          <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3 text-xs text-gray-600">
            This card shows the value of the selected measure. Manage measures in the <strong>Metrics</strong> tab.
            <div className="mt-2 w-40"><label className={lbl}>Number format</label>
              <select className={inp} value={cfg.format || ''} onChange={(e) => setC({ format: e.target.value })}>
                <option value="">Plain</option><option value="currency">Currency</option><option value="percent">Percent</option>
              </select>
            </div>
          </div>
        )}

        {/* Text */}
        {type === 'text' && (
          <div>
            <label className={lbl}>Content</label>
            <textarea className={`${inp} h-32 font-mono`} value={cfg.markdown || ''} onChange={(e) => setC({ markdown: e.target.value })} />
          </div>
        )}

        {/* KPI / gauge (field-based; hidden when using a saved measure) */}
        {isKpi && sourceType !== 'measure' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Value field</label>{colSelect(cfg.valueField, (v) => setC({ valueField: v }), columns)}</div>
            <div><label className={lbl}>Aggregation</label>
              <select className={inp} value={cfg.fn || 'sum'} onChange={(e) => setC({ fn: e.target.value })}>
                {AGG_FUNCTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Number format</label>
              <select className={inp} value={cfg.format || ''} onChange={(e) => setC({ format: e.target.value })}>
                <option value="">Plain</option><option value="currency">Currency</option><option value="percent">Percent</option>
              </select>
            </div>
            {type === 'gauge'
              ? <div><label className={lbl}>Target</label><input className={inp} type="number" value={cfg.target ?? ''} onChange={(e) => setC({ target: Number(e.target.value) })} /></div>
              : <label className="flex items-center gap-2 text-sm text-gray-600 mt-6"><input type="checkbox" checked={!!cfg.compareToPrevious} onChange={(e) => setC({ compareToPrevious: e.target.checked })} /> Compare to previous sync</label>}
          </div>
        )}

        {/* Charts */}
        {(isChart || isCircular) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>{isCircular ? 'Label field' : 'X axis / category'}</label>{colSelect(cfg.xField, (v) => setC({ xField: v }), columns)}</div>
              {isCircular && <div><label className={lbl}>Value field</label>{colSelect(cfg.valueField, (v) => setC({ valueField: v }), columns)}</div>}
              {type === 'pie' && <label className="flex items-center gap-2 text-sm text-gray-600 mt-6"><input type="checkbox" checked={!!cfg.donut} onChange={(e) => setC({ donut: e.target.checked })} /> Donut</label>}
            </div>
            {isChart && (
              <div>
                <label className={lbl}>Series (values)</label>
                {series.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    {colSelect(s.field, (v) => { const n = [...series]; n[i] = { ...n[i], field: v }; setSeries(n); }, numCols.length ? numCols : columns)}
                    <select className={inp} value={s.fn || 'sum'} onChange={(e) => { const n = [...series]; n[i] = { ...n[i], fn: e.target.value }; setSeries(n); }}>
                      {AGG_FUNCTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {type === 'combo' && (
                      <select className={inp} value={s.kind || 'bar'} onChange={(e) => { const n = [...series]; n[i] = { ...n[i], kind: e.target.value }; setSeries(n); }}>
                        <option value="bar">Bar</option><option value="line">Line</option>
                      </select>
                    )}
                    <button onClick={() => setSeries(series.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => setSeries([...series, { field: numCols[0]?.name || '', fn: 'sum' }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus size={14} /> Add series</button>
              </div>
            )}
          </div>
        )}

        {/* Pivot / heatmap */}
        {isPivot && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>Rows</label>{colSelect(cfg.rowField, (v) => setC({ rowField: v }), columns)}</div>
            <div><label className={lbl}>Columns</label>{colSelect(cfg.colField, (v) => setC({ colField: v }), columns)}</div>
            <div><label className={lbl}>Value (summed)</label>{colSelect(cfg.valueField, (v) => setC({ valueField: v }), columns)}</div>
          </div>
        )}

        {/* Computed columns */}
        {type !== 'text' && (
          <details className="border border-gray-200 rounded-lg p-3">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">Computed columns (per-row formulas)</summary>
            <div className="text-xs text-gray-500 mt-1 mb-2 space-y-1">
              <p>Create a new column from a formula evaluated on <strong>each row</strong>. Reference other columns by name (e.g. <code>Revenue</code>); spaces become <code>_</code> (e.g. <code>Unit Price</code> → <code>Unit_Price</code>).</p>
              <p>Examples: <code>Revenue - Cost</code> · <code>Qty * Unit_Price</code> · <code>(Revenue - Cost) / Revenue * 100</code></p>
              <p>Operators <code>+ - * / %</code> · functions <code>abs() round() min() max() if(cond, a, b)</code>. The new column can then be charted or aggregated like any other.</p>
            </div>
            {computed.map((c, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={inp} placeholder="Name" value={c.name} onChange={(e) => { const n = [...computed]; n[i] = { ...n[i], name: e.target.value }; setComputed(n); }} />
                <input className={`${inp} flex-1 font-mono`} placeholder="Expression" value={c.expr} onChange={(e) => { const n = [...computed]; n[i] = { ...n[i], expr: e.target.value }; setComputed(n); }} />
                <button onClick={() => setComputed(computed.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setComputed([...computed, { name: '', expr: '' }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus size={14} /> Add formula</button>
          </details>
        )}

        {/* Filters */}
        {type !== 'text' && (
          <details className="border border-gray-200 rounded-lg p-3">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">Filters</summary>
            {filters.map((f, i) => (
              <div key={i} className="flex gap-2 mb-2 mt-2">
                {colSelect(f.field, (v) => { const n = [...filters]; n[i] = { ...n[i], field: v }; setFilters(n); })}
                <select className={inp} value={f.op} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], op: e.target.value }; setFilters(n); }}>
                  {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className={inp} placeholder="value" value={f.value ?? ''} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], value: e.target.value }; setFilters(n); }} />
                <button onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setFilters([...filters, { field: columns[0]?.name || '', op: 'eq', value: '' }])} className="text-sm text-blue-600 flex items-center gap-1 mt-2"><Plus size={14} /> Add filter</button>
          </details>
        )}

        {/* Metrics injection */}
        {type !== 'text' && metrics.length > 0 && (
          <details className="border border-gray-200 rounded-lg p-3">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">Inject named metrics into formulas</summary>
            <div className="mt-2 space-y-1">
              {metrics.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={(cfg.metrics || []).includes(m.id)}
                    onChange={(e) => { const cur = new Set(cfg.metrics || []); e.target.checked ? cur.add(m.id) : cur.delete(m.id); setC({ metrics: [...cur] }); }} />
                  <span className="font-medium">{m.name}</span> <code className="text-xs text-gray-400">{m.expression}</code>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save widget'}</button>
      </div>
    </Modal>
  );
}
