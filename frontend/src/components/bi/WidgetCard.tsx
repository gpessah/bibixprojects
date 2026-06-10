import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, GripVertical, RefreshCw } from 'lucide-react';
import biApi, { BiWidget, BiTheme } from '../../api/bi';
import WidgetRenderer from './WidgetRenderer';

interface Props {
  widget: BiWidget;
  theme: BiTheme;
  editMode: boolean;
  version?: number;            // bump to force a data refetch
  runtimeFilters?: any[];      // dashboard-level filters that apply to this widget
  dragHandleProps?: any;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Build the /query body from a widget's config based on its type.
function buildQuery(widget: BiWidget, runtimeFilters: any[] = []) {
  const cfg = widget.config || {};
  const source = { type: widget.source_type, id: widget.source_id };
  const filters = [...(cfg.filters || []), ...runtimeFilters];
  const base: any = { computed: cfg.computed, filters, scalars: cfg.scalars };
  const metrics = cfg.metrics;

  if (widget.type === 'kpi' || widget.type === 'gauge') {
    const field = cfg.valueField || cfg.series?.[0]?.field;
    return { source, config: base, metrics, kpi: { field, fn: cfg.fn || 'sum', compareToPrevious: !!cfg.compareToPrevious } };
  }

  if (widget.type === 'pivot' || widget.type === 'heatmap') {
    return { source, config: { ...base, limit: cfg.limit || 2000 }, metrics };
  }

  if (widget.type === 'table') {
    const config: any = { ...base, sort: cfg.sort, limit: cfg.limit || 200 };
    if (cfg.groupBy?.length || cfg.aggregations?.length) {
      config.groupBy = cfg.groupBy; config.aggregations = cfg.aggregations;
    }
    return { source, config, metrics };
  }

  // charts
  const xField = cfg.xField;
  const series = (cfg.series || []).filter((s: any) => s.field);
  const aggregations = series.length
    ? series.map((s: any) => ({ name: s.field, fn: s.fn || 'sum', field: s.field }))
    : (cfg.valueField ? [{ name: cfg.valueField, fn: cfg.fn || 'sum', field: cfg.valueField }] : []);
  return {
    source,
    config: { ...base, groupBy: xField ? [xField] : [], aggregations, sort: cfg.sort, limit: cfg.limit || 100 },
    metrics,
  };
}

export default function WidgetCard({ widget, theme, editMode, version, runtimeFilters, dragHandleProps, onEdit, onDelete }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (widget.type === 'text' || widget.source_type === 'none' || !widget.source_id) return;
    setLoading(true); setError(null);
    try {
      const body = buildQuery(widget, runtimeFilters);
      const res = await biApi.query(body);
      if (res.kpi) { setKpi(res); }
      else { setRows(res.rows || []); setColumns(res.columns || []); }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [widget, version, JSON.stringify(runtimeFilters || [])]);

  useEffect(() => { load(); }, [load]);

  const cardStyle = theme.cardStyle === 'bordered'
    ? 'bg-white border border-gray-200'
    : theme.cardStyle === 'flat' ? 'bg-white/70' : 'bg-white shadow-sm';

  return (
    <div className={`rounded-xl ${cardStyle} h-full flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        {editMode && <span {...dragHandleProps} className="cursor-grab text-gray-300 hover:text-gray-500"><GripVertical size={14} /></span>}
        <h3 className="text-sm font-semibold text-gray-700 truncate flex-1">{widget.title || 'Untitled'}</h3>
        <button onClick={load} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Refresh"><RefreshCw size={13} /></button>
        {editMode && (
          <>
            <button onClick={onEdit} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Edit"><Pencil size={13} /></button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 p-1">
        <WidgetRenderer widget={widget} theme={theme} rows={rows} columns={columns} kpi={kpi} loading={loading} error={error} />
      </div>
    </div>
  );
}
