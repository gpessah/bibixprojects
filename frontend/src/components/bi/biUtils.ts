import type { BiTheme } from '../../api/bi';

export const DEFAULT_PALETTE = ['#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#eab308', '#84cc16'];

export function palette(theme?: BiTheme): string[] {
  return theme?.palette && theme.palette.length ? theme.palette : DEFAULT_PALETTE;
}

export function colorAt(theme: BiTheme | undefined, i: number): string {
  const p = palette(theme);
  return p[i % p.length];
}

export function formatNumber(v: any, format?: string): string {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[%$€£,\s]/g, ''));
  if (!isFinite(n)) return v == null ? '' : String(v);
  if (format === 'currency') return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  if (format === 'percent') return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const AGG_FUNCTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Count distinct' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'median', label: 'Median' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
] as const;

export const WIDGET_TYPES: { value: string; label: string; icon: string; needsData: boolean }[] = [
  { value: 'kpi',     label: 'KPI card',      icon: '🔢', needsData: true },
  { value: 'table',   label: 'Table',         icon: '▦',  needsData: true },
  { value: 'pivot',   label: 'Pivot table',   icon: '⊞',  needsData: true },
  { value: 'bar',     label: 'Bar / Column',  icon: '📊', needsData: true },
  { value: 'line',    label: 'Line',          icon: '📈', needsData: true },
  { value: 'area',    label: 'Area',          icon: '🏔', needsData: true },
  { value: 'pie',     label: 'Pie / Donut',   icon: '🥧', needsData: true },
  { value: 'scatter', label: 'Scatter',       icon: '⠿',  needsData: true },
  { value: 'combo',   label: 'Combo (bar+line)', icon: '📉', needsData: true },
  { value: 'funnel',  label: 'Funnel',        icon: '🔻', needsData: true },
  { value: 'gauge',   label: 'Gauge',         icon: '🎯', needsData: true },
  { value: 'treemap', label: 'Treemap',       icon: '🗂', needsData: true },
  { value: 'heatmap', label: 'Heatmap',       icon: '🔥', needsData: true },
  { value: 'text',    label: 'Text / Note',   icon: '📝', needsData: false },
];

export const FILTER_OPS = [
  { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' }, { value: 'ncontains', label: 'not contains' },
  { value: 'blank', label: 'is blank' }, { value: 'notblank', label: 'not blank' },
  { value: 'dgte', label: 'date ≥' }, { value: 'dlte', label: 'date ≤' },
];
