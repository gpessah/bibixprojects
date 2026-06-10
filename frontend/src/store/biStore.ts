import { create } from 'zustand';
import biApi, {
  BiConnection, BiDatasource, BiManualDataset, BiMetric, BiDashboard, BiTemplate, BiWidget,
} from '../api/bi';

interface BiState {
  connections: BiConnection[];
  datasources: BiDatasource[];
  manualDatasets: BiManualDataset[];
  metrics: BiMetric[];
  dashboards: BiDashboard[];
  templates: BiTemplate[];
  current: BiDashboard | null;
  loading: boolean;

  loadAll: () => Promise<void>;
  loadConnections: () => Promise<void>;
  loadDatasources: () => Promise<void>;
  loadManual: () => Promise<void>;
  loadMetrics: () => Promise<void>;
  loadDashboards: () => Promise<void>;

  openDashboard: (id: string) => Promise<void>;
  closeDashboard: () => void;
  patchCurrent: (patch: Partial<BiDashboard>) => void;
  setWidgets: (widgets: BiWidget[]) => void;
  upsertWidget: (w: BiWidget) => void;
  removeWidget: (id: string) => void;
}

export const useBiStore = create<BiState>((set, get) => ({
  connections: [],
  datasources: [],
  manualDatasets: [],
  metrics: [],
  dashboards: [],
  templates: [],
  current: null,
  loading: false,

  loadAll: async () => {
    set({ loading: true });
    try {
      const [connections, datasources, manualDatasets, metrics, dashboards, templates] = await Promise.all([
        biApi.listConnections(), biApi.listDatasources(), biApi.listManual(),
        biApi.listMetrics(), biApi.listDashboards(), biApi.listTemplates(),
      ]);
      set({ connections, datasources, manualDatasets, metrics, dashboards, templates });
    } finally {
      set({ loading: false });
    }
  },

  loadConnections: async () => set({ connections: await biApi.listConnections() }),
  loadDatasources: async () => set({ datasources: await biApi.listDatasources() }),
  loadManual: async () => set({ manualDatasets: await biApi.listManual() }),
  loadMetrics: async () => set({ metrics: await biApi.listMetrics() }),
  loadDashboards: async () => set({ dashboards: await biApi.listDashboards() }),

  openDashboard: async (id) => {
    set({ loading: true });
    try { set({ current: await biApi.getDashboard(id) }); }
    finally { set({ loading: false }); }
  },
  closeDashboard: () => set({ current: null }),

  patchCurrent: (patch) => set((s) => (s.current ? { current: { ...s.current, ...patch } } : {})),

  setWidgets: (widgets) => set((s) => (s.current ? { current: { ...s.current, widgets } } : {})),

  upsertWidget: (w) => set((s) => {
    if (!s.current) return {};
    const widgets = s.current.widgets ? [...s.current.widgets] : [];
    const i = widgets.findIndex((x) => x.id === w.id);
    if (i >= 0) widgets[i] = w; else widgets.push(w);
    return { current: { ...s.current, widgets } };
  }),

  removeWidget: (id) => set((s) => {
    if (!s.current) return {};
    return { current: { ...s.current, widgets: (s.current.widgets || []).filter((w) => w.id !== id) } };
  }),
}));
