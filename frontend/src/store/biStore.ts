import { create } from 'zustand';
import biApi, {
  BiConnection, BiDatasource, BiManualDataset, BiMetric, BiDashboard, BiTemplate, BiWidget, BiCombined,
} from '../api/bi';

// Defensive: never let a non-array API response (e.g. an HTML error page during
// a deploy window) reach the UI and crash a .map() into a blank screen.
const arr = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);

interface BiState {
  connections: BiConnection[];
  datasources: BiDatasource[];
  manualDatasets: BiManualDataset[];
  combined: BiCombined[];
  metrics: BiMetric[];
  dashboards: BiDashboard[];
  templates: BiTemplate[];
  current: BiDashboard | null;
  loading: boolean;

  loadAll: () => Promise<void>;
  loadConnections: () => Promise<void>;
  loadDatasources: () => Promise<void>;
  loadManual: () => Promise<void>;
  loadCombined: () => Promise<void>;
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
  combined: [],
  metrics: [],
  dashboards: [],
  templates: [],
  current: null,
  loading: false,

  loadAll: async () => {
    set({ loading: true });
    try {
      const [connections, datasources, manualDatasets, combined, metrics, dashboards, templates] = await Promise.all([
        biApi.listConnections(), biApi.listDatasources(), biApi.listManual(),
        biApi.listCombined(), biApi.listMetrics(), biApi.listDashboards(), biApi.listTemplates(),
      ]);
      set({
        connections: arr(connections), datasources: arr(datasources), manualDatasets: arr(manualDatasets),
        combined: arr(combined), metrics: arr(metrics), dashboards: arr(dashboards), templates: arr(templates),
      });
    } finally {
      set({ loading: false });
    }
  },

  loadConnections: async () => set({ connections: arr(await biApi.listConnections()) }),
  loadDatasources: async () => set({ datasources: arr(await biApi.listDatasources()) }),
  loadManual: async () => set({ manualDatasets: arr(await biApi.listManual()) }),
  loadCombined: async () => set({ combined: arr(await biApi.listCombined()) }),
  loadMetrics: async () => set({ metrics: arr(await biApi.listMetrics()) }),
  loadDashboards: async () => set({ dashboards: arr(await biApi.listDashboards()) }),

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
