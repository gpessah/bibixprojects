import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter, ComposedChart, FunnelChart, Funnel,
  Treemap, RadialBarChart, RadialBar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { BiWidget, BiTheme } from '../../api/bi';
import { colorAt, formatNumber, palette } from './biUtils';

interface Props {
  widget: BiWidget;
  theme: BiTheme;
  rows: any[];
  columns: { name: string; type: string }[];
  kpi?: { value: number; previous: number | null; delta: number | null } | null;
  loading?: boolean;
  error?: string | null;
}

export default function WidgetRenderer({ widget, theme, rows, columns, kpi, loading, error }: Props) {
  const cfg = widget.config || {};
  const colors = palette(theme);

  if (loading) return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  if (error) return <div className="h-full flex items-center justify-center text-red-500 text-xs px-3 text-center">{error}</div>;

  // ── Text ────────────────────────────────────────────────────────────────────
  if (widget.type === 'text') {
    return (
      <div className="h-full overflow-auto p-3 text-sm text-gray-700 whitespace-pre-wrap">
        {cfg.markdown || cfg.text || 'Double-click to edit this note.'}
      </div>
    );
  }

  if (widget.source_type === 'none' || !widget.source_id) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-sm px-4 text-center">No data source — open the editor to connect one.</div>;
  }

  // ── KPI ───────────────────────────────────────────────────────────────────────
  if (widget.type === 'kpi') {
    const v = kpi?.value ?? 0;
    const delta = kpi?.delta;
    const up = (delta ?? 0) >= 0;
    return (
      <div className="h-full flex flex-col justify-center px-4">
        <div className="text-3xl font-bold text-gray-900 leading-tight">{formatNumber(v, cfg.format)}</div>
        {delta != null && (
          <div className={`mt-1 flex items-center gap-1 text-sm font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
            {up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {Math.abs(delta).toFixed(1)}% <span className="text-gray-400 font-normal">vs previous</span>
          </div>
        )}
      </div>
    );
  }

  // ── Gauge ──────────────────────────────────────────────────────────────────────
  if (widget.type === 'gauge') {
    const v = kpi?.value ?? 0;
    const target = Number(cfg.target) || 100;
    const pct = Math.max(0, Math.min(100, (v / target) * 100));
    const data = [{ name: 'value', value: pct, fill: colors[0] }];
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height="80%">
          <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={210} endAngle={-30}>
            <RadialBar background dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="-mt-8 text-center">
          <div className="text-2xl font-bold text-gray-900">{formatNumber(v, cfg.format)}</div>
          <div className="text-xs text-gray-400">of {formatNumber(target, cfg.format)} ({pct.toFixed(0)}%)</div>
        </div>
      </div>
    );
  }

  // ── Table ─────────────────────────────────────────────────────────────────────
  if (widget.type === 'table') {
    const cols = (cfg.columns && cfg.columns.length ? cfg.columns : columns.map((c) => c.name)) as string[];
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50">
            <tr>{cols.map((c) => <th key={c} className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {cols.map((c) => <td key={c} className="px-3 py-1.5 border-b border-gray-100 text-gray-700 whitespace-nowrap">{typeof r[c] === 'number' ? formatNumber(r[c]) : String(r[c] ?? '')}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-gray-400">No rows</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return <ChartBody widget={widget} rows={rows} colors={colors} cfg={cfg} columns={columns} />;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function ChartBody({ widget, rows, colors, cfg, columns }: { widget: BiWidget; rows: any[]; colors: string[]; cfg: any; columns: any[] }) {
  const xField: string = cfg.xField || columns[0]?.name || 'name';
  const series: { field: string; name?: string; kind?: string }[] =
    (cfg.series && cfg.series.length ? cfg.series : []).filter((s: any) => s.field);

  // Pivot / heatmap compute a matrix client-side from raw rows. Supports multiple
  // row fields and multiple column fields, plus a chosen value aggregation.
  const pivot = useMemo(() => {
    if (widget.type !== 'pivot' && widget.type !== 'heatmap') return null;
    const rowFields: string[] = (cfg.rowFields && cfg.rowFields.length ? cfg.rowFields : [cfg.rowField || xField]).filter(Boolean);
    const colFields: string[] = (cfg.colFields && cfg.colFields.length ? cfg.colFields : (cfg.colField ? [cfg.colField] : [])).filter(Boolean);
    const valField: string = cfg.valueField;
    const valFn: string = cfg.valueFn || 'sum';
    if (!rowFields.length || !valField) return null;

    const sep = ' / ';
    const num = (v: any) => { const n = Number(String(v ?? '').replace(/[%$€£,\s]/g, '')); return isFinite(n) ? n : null; };
    const agg = (vals: any[]) => {
      const ns = vals.map(num).filter((n): n is number => n !== null);
      switch (valFn) {
        case 'count': return vals.filter((v) => v !== '' && v != null).length;
        case 'count_distinct': return new Set(vals.filter((v) => v !== '' && v != null).map(String)).size;
        case 'avg': return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
        case 'min': return ns.length ? Math.min(...ns) : 0;
        case 'max': return ns.length ? Math.max(...ns) : 0;
        default: return ns.reduce((a, b) => a + b, 0);
      }
    };

    const colKeySet = new Set<string>();
    const byRow = new Map<string, { vals: string[]; cells: Map<string, any[]> }>();
    for (const r of rows) {
      const rk = rowFields.map((f) => String(r[f] ?? '')).join(sep);
      if (!byRow.has(rk)) byRow.set(rk, { vals: rowFields.map((f) => String(r[f] ?? '')), cells: new Map() });
      const ck = colFields.length ? colFields.map((f) => String(r[f] ?? '')).join(sep) : valField;
      colKeySet.add(ck);
      const cells = byRow.get(rk)!.cells;
      if (!cells.has(ck)) cells.set(ck, []);
      cells.get(ck)!.push(r[valField]);
    }
    const colKeys = Array.from(colKeySet).sort();
    const data = Array.from(byRow.values()).map((rw) => ({
      vals: rw.vals,
      cells: colKeys.map((ck) => (rw.cells.has(ck) ? agg(rw.cells.get(ck)!) : null)),
    }));
    return { rowFields, colKeys, data };
  }, [widget.type, rows, cfg, xField]);

  if ((widget.type === 'pivot' || widget.type === 'heatmap') && pivot) {
    const flat = pivot.data.flatMap((d) => d.cells.map((v) => Number(v) || 0));
    const max = Math.max(1, ...flat);
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {pivot.rowFields.map((f) => <th key={f} className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b whitespace-nowrap">{f}</th>)}
              {pivot.colKeys.map((k) => <th key={k} className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b whitespace-nowrap">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {pivot.data.map((d, i) => (
              <tr key={i}>
                {d.vals.map((v, j) => <td key={j} className="px-3 py-1.5 border-b border-gray-100 font-medium text-gray-700 whitespace-nowrap">{v}</td>)}
                {d.cells.map((val, k) => {
                  const n = Number(val) || 0;
                  const intensity = widget.type === 'heatmap' ? n / max : 0;
                  return (
                    <td key={k} className="px-3 py-1.5 border-b border-gray-100 text-right text-gray-700"
                      style={widget.type === 'heatmap' ? { backgroundColor: `rgba(37,99,235,${intensity.toFixed(2)})`, color: intensity > 0.5 ? '#fff' : undefined } : undefined}>
                      {val == null ? '' : formatNumber(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!series.length && !['pie', 'funnel', 'treemap'].includes(widget.type)) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-sm px-4 text-center">Pick a value field in the editor.</div>;
  }

  const valueField = series[0]?.field || cfg.valueField || columns.find((c) => c.type === 'number')?.name;

  const wrap = (children: React.ReactNode) => (
    <ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer>
  );
  const common = <><CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey={xField} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></>;

  switch (widget.type) {
    case 'bar':
      return wrap(<BarChart data={rows}>{common}{series.map((s, i) => <Bar key={i} dataKey={s.field} name={s.name || s.field} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />)}</BarChart>);
    case 'line':
      return wrap(<LineChart data={rows}>{common}{series.map((s, i) => <Line key={i} type="monotone" dataKey={s.field} name={s.name || s.field} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />)}</LineChart>);
    case 'area':
      return wrap(<AreaChart data={rows}>{common}{series.map((s, i) => <Area key={i} type="monotone" dataKey={s.field} name={s.name || s.field} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.25} />)}</AreaChart>);
    case 'combo':
      return wrap(<ComposedChart data={rows}>{common}{series.map((s, i) => s.kind === 'line'
        ? <Line key={i} type="monotone" dataKey={s.field} name={s.name || s.field} stroke={colors[i % colors.length]} strokeWidth={2} />
        : <Bar key={i} dataKey={s.field} name={s.name || s.field} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />)}</ComposedChart>);
    case 'scatter':
      return wrap(<ScatterChart>{common}<Scatter data={rows} fill={colors[0]} dataKey={valueField} /></ScatterChart>);
    case 'pie':
      return wrap(<PieChart><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Pie data={rows} dataKey={valueField} nameKey={xField} cx="50%" cy="50%" outerRadius="80%" innerRadius={cfg.donut ? '55%' : 0} label>{rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart>);
    case 'funnel':
      return wrap(<FunnelChart><Tooltip /><Funnel dataKey={valueField} data={rows} isAnimationActive><LabelList position="right" fill="#374151" stroke="none" dataKey={xField} />{rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Funnel></FunnelChart>);
    case 'treemap':
      return wrap(<Treemap data={rows.map((r, i) => ({ name: String(r[xField]), size: Number(r[valueField]) || 0, fill: colors[i % colors.length] }))} dataKey="size" nameKey="name" stroke="#fff" />);
    default:
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Unsupported widget</div>;
  }
}
