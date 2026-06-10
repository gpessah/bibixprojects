// ─────────────────────────────────────────────────────────────────────────────
// Starter dashboard templates.
//
// A template is a ready-made layout of widgets (types, titles, grid position,
// visual config). Data sources are intentionally left unset — the user picks
// which connected sheet / manual dataset feeds each widget after instantiating,
// then can freely rearrange everything (templates + full drag-and-drop).
//
// Grid model: 12 columns; layout = { x, y, w, h } in grid units.
// ─────────────────────────────────────────────────────────────────────────────

const PALETTES = {
  ocean:   ['#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#6366f1'],
  sunset:  ['#f97316', '#ef4444', '#ec4899', '#f59e0b', '#d946ef'],
  forest:  ['#16a34a', '#65a30d', '#0d9488', '#059669', '#84cc16'],
  mono:    ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
};

const TEMPLATES = [
  {
    id: 'sales-overview',
    name: 'Sales Overview',
    description: 'KPI cards, revenue trend, and a breakdown by category — a classic sales dashboard.',
    theme: { palette: PALETTES.ocean, background: '#f8fafc', cardStyle: 'soft', font: 'Inter', accent: '#2563eb' },
    widgets: [
      { type: 'kpi',   title: 'Total Revenue',  layout: { x: 0, y: 0, w: 3, h: 2 }, config: { fn: 'sum', compareToPrevious: true, format: 'currency' } },
      { type: 'kpi',   title: 'Total Orders',   layout: { x: 3, y: 0, w: 3, h: 2 }, config: { fn: 'count', compareToPrevious: true } },
      { type: 'kpi',   title: 'Avg Order Value',layout: { x: 6, y: 0, w: 3, h: 2 }, config: { fn: 'avg', format: 'currency' } },
      { type: 'kpi',   title: 'Conversion %',   layout: { x: 9, y: 0, w: 3, h: 2 }, config: { fn: 'avg', format: 'percent' } },
      { type: 'line',  title: 'Revenue Trend',  layout: { x: 0, y: 2, w: 8, h: 4 }, config: { series: [{ fn: 'sum' }] } },
      { type: 'pie',   title: 'By Category',    layout: { x: 8, y: 2, w: 4, h: 4 }, config: {} },
      { type: 'table', title: 'Detail',         layout: { x: 0, y: 6, w: 12, h: 4 }, config: {} },
    ],
  },
  {
    id: 'financial-report',
    name: 'Financial Report',
    description: 'Revenue vs cost, margin KPI, and a combo chart — pairs sheet data with manual budget inputs.',
    theme: { palette: PALETTES.forest, background: '#f7fdf9', cardStyle: 'bordered', font: 'Inter', accent: '#16a34a' },
    widgets: [
      { type: 'kpi',    title: 'Gross Margin %', layout: { x: 0, y: 0, w: 4, h: 2 }, config: { fn: 'avg', format: 'percent' } },
      { type: 'kpi',    title: 'Net Profit',     layout: { x: 4, y: 0, w: 4, h: 2 }, config: { fn: 'sum', format: 'currency', compareToPrevious: true } },
      { type: 'kpi',    title: 'Budget Variance',layout: { x: 8, y: 0, w: 4, h: 2 }, config: { fn: 'sum', format: 'currency' } },
      { type: 'combo',  title: 'Revenue vs Cost',layout: { x: 0, y: 2, w: 7, h: 4 }, config: { series: [{ fn: 'sum', kind: 'bar' }, { fn: 'sum', kind: 'line' }] } },
      { type: 'bar',    title: 'Expense Breakdown', layout: { x: 7, y: 2, w: 5, h: 4 }, config: {} },
      { type: 'pivot',  title: 'P&L by Period',  layout: { x: 0, y: 6, w: 12, h: 4 }, config: {} },
    ],
  },
  {
    id: 'kpi-scorecard',
    name: 'KPI Scorecard',
    description: 'A clean wall of metric cards with gauges — great for an at-a-glance executive view.',
    theme: { palette: PALETTES.sunset, background: '#fffaf5', cardStyle: 'soft', font: 'Inter', accent: '#f97316' },
    widgets: [
      { type: 'kpi',   title: 'Metric 1', layout: { x: 0, y: 0, w: 3, h: 2 }, config: { fn: 'sum', compareToPrevious: true } },
      { type: 'kpi',   title: 'Metric 2', layout: { x: 3, y: 0, w: 3, h: 2 }, config: { fn: 'sum', compareToPrevious: true } },
      { type: 'kpi',   title: 'Metric 3', layout: { x: 6, y: 0, w: 3, h: 2 }, config: { fn: 'avg' } },
      { type: 'gauge', title: 'Target Progress', layout: { x: 9, y: 0, w: 3, h: 4 }, config: { target: 100 } },
      { type: 'bar',   title: 'Trend by Group', layout: { x: 0, y: 2, w: 9, h: 4 }, config: {} },
      { type: 'text',  title: 'Notes', layout: { x: 0, y: 6, w: 12, h: 2 }, config: { markdown: '## Notes\\nAdd commentary about these numbers here.' } },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Dashboard',
    description: 'Start from an empty canvas and build it your way.',
    theme: { palette: PALETTES.ocean, background: '#f8fafc', cardStyle: 'soft', font: 'Inter', accent: '#2563eb' },
    widgets: [],
  },
];

module.exports = { TEMPLATES, PALETTES };
