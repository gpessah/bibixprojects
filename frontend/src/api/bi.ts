import api from './client';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BiConnection { id: string; google_email: string; created_at: string; }

export interface BiColumn { name: string; type: 'number' | 'text' | 'date'; }

export interface BiDatasource {
  id: string; name: string; connection_id: string; google_email?: string;
  spreadsheet_id: string; spreadsheet_name?: string; sheet_name?: string; cell_range?: string;
  refresh_interval_minutes: number; auto_sync: number;
  last_synced_at?: string | null; last_error?: string | null; row_count: number;
  column_meta: BiColumn[];
}

export interface BiManualDataset { id: string; name: string; columns: BiColumn[]; created_at: string; }
export interface BiMetric { id: string; name: string; expression: string; description?: string; }

export type WidgetType =
  | 'table' | 'pivot' | 'kpi' | 'bar' | 'line' | 'area' | 'pie'
  | 'scatter' | 'combo' | 'funnel' | 'gauge' | 'heatmap' | 'treemap' | 'text';

export interface BiWidget {
  id: string; dashboard_id: string; type: WidgetType; title?: string;
  source_type: 'none' | 'datasource' | 'manual';
  source_id?: string | null;
  config: any; layout: { x?: number; y?: number; w?: number; h?: number }; position: number;
}

export interface BiTheme {
  palette?: string[]; background?: string; accent?: string; font?: string;
  cardStyle?: 'soft' | 'bordered' | 'flat';
}

export interface BiDashboard {
  id: string; name: string; description?: string; theme: BiTheme;
  layout: any; is_template: number; widgets?: BiWidget[]; updated_at: string;
}

export interface BiTemplate { id: string; name: string; description: string; theme: BiTheme; widgetCount: number; }

// ── Connections / OAuth ─────────────────────────────────────────────────────
export const biApi = {
  listConnections: () => api.get<BiConnection[]>('/bi/connections').then(r => r.data),
  googleAuthUrl: () => api.get<{ url: string }>('/bi/google/auth').then(r => r.data.url),
  deleteConnection: (id: string) => api.delete(`/bi/connections/${id}`),
  listSpreadsheets: (connId: string, q?: string) =>
    api.get(`/bi/connections/${connId}/spreadsheets`, { params: { q } }).then(r => r.data),
  listTabs: (connId: string, sheetId: string) =>
    api.get(`/bi/connections/${connId}/spreadsheets/${sheetId}/tabs`).then(r => r.data),

  // Datasources
  listDatasources: () => api.get<BiDatasource[]>('/bi/datasources').then(r => r.data),
  createDatasource: (body: any) => api.post<BiDatasource>('/bi/datasources', body).then(r => r.data),
  updateDatasource: (id: string, body: any) => api.patch(`/bi/datasources/${id}`, body),
  deleteDatasource: (id: string) => api.delete(`/bi/datasources/${id}`),
  refreshDatasource: (id: string) => api.post(`/bi/datasources/${id}/refresh`).then(r => r.data),
  datasourceRows: (id: string, limit = 200) =>
    api.get(`/bi/datasources/${id}/rows`, { params: { limit } }).then(r => r.data),
  datasourceHistory: (id: string) => api.get(`/bi/datasources/${id}/history`).then(r => r.data),

  // Manual datasets
  listManual: () => api.get<BiManualDataset[]>('/bi/manual-datasets').then(r => r.data),
  createManual: (body: any) => api.post<BiManualDataset>('/bi/manual-datasets', body).then(r => r.data),
  updateManual: (id: string, body: any) => api.patch(`/bi/manual-datasets/${id}`, body),
  deleteManual: (id: string) => api.delete(`/bi/manual-datasets/${id}`),
  manualRows: (id: string) => api.get(`/bi/manual-datasets/${id}/rows`).then(r => r.data),
  saveManualRows: (id: string, rows: any[]) => api.put(`/bi/manual-datasets/${id}/rows`, { rows }),

  // Metrics
  listMetrics: () => api.get<BiMetric[]>('/bi/metrics').then(r => r.data),
  createMetric: (body: any) => api.post<BiMetric>('/bi/metrics', body).then(r => r.data),
  updateMetric: (id: string, body: any) => api.patch(`/bi/metrics/${id}`, body),
  deleteMetric: (id: string) => api.delete(`/bi/metrics/${id}`),

  // Dashboards + widgets
  listTemplates: () => api.get<BiTemplate[]>('/bi/templates').then(r => r.data),
  listDashboards: () => api.get<BiDashboard[]>('/bi/dashboards').then(r => r.data),
  getDashboard: (id: string) => api.get<BiDashboard>(`/bi/dashboards/${id}`).then(r => r.data),
  createDashboard: (body: any) => api.post<BiDashboard>('/bi/dashboards', body).then(r => r.data),
  updateDashboard: (id: string, body: any) => api.patch(`/bi/dashboards/${id}`, body),
  deleteDashboard: (id: string) => api.delete(`/bi/dashboards/${id}`),
  duplicateDashboard: (id: string) => api.post<BiDashboard>(`/bi/dashboards/${id}/duplicate`).then(r => r.data),

  addWidget: (dashId: string, body: any) => api.post<BiWidget>(`/bi/dashboards/${dashId}/widgets`, body).then(r => r.data),
  updateWidget: (id: string, body: any) => api.patch(`/bi/widgets/${id}`, body),
  deleteWidget: (id: string) => api.delete(`/bi/widgets/${id}`),
  saveLayout: (dashId: string, layouts: any[]) => api.patch(`/bi/dashboards/${dashId}/widgets/layout`, { layouts }),

  // Query engine
  query: (body: any) => api.post('/bi/query', body).then(r => r.data),
};

export default biApi;
