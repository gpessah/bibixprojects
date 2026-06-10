import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, LayoutDashboard, Database, Table2, Sigma } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBiStore } from '../store/biStore';
import DashboardsPanel from '../components/bi/DashboardsPanel';
import DataSourcesPanel from '../components/bi/DataSourcesPanel';
import ManualDataPanel from '../components/bi/ManualDataPanel';
import MetricsPanel from '../components/bi/MetricsPanel';
import DashboardView from '../components/bi/DashboardView';

type Tab = 'dashboards' | 'sources' | 'manual' | 'metrics';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboards', label: 'Dashboards',   icon: <LayoutDashboard size={15} /> },
  { id: 'sources',    label: 'Data Sources', icon: <Database size={15} /> },
  { id: 'manual',     label: 'Manual Data',  icon: <Table2 size={15} /> },
  { id: 'metrics',    label: 'Metrics',      icon: <Sigma size={15} /> },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('dashboards');
  const [openId, setOpenId] = useState<string | null>(null);
  const { loadAll } = useBiStore();
  const [params, setParams] = useSearchParams();

  useEffect(() => { loadAll(); }, []);

  // OAuth redirect feedback (?bi=connected | error)
  useEffect(() => {
    const status = params.get('bi');
    if (status === 'connected') { toast.success('Google account connected'); setTab('sources'); }
    else if (status === 'error') { toast.error(`Connection failed: ${params.get('msg') || 'unknown'}`); setTab('sources'); }
    if (status) { params.delete('bi'); params.delete('msg'); setParams(params, { replace: true }); }
  }, []);

  if (openId) return <DashboardView dashboardId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center"><BarChart3 size={18} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reports & BI</h1>
            <p className="text-xs text-gray-500">Connect spreadsheets, build dashboards, and report with live formulas</p>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={['flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'].join(' ')}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'dashboards' && <DashboardsPanel onOpen={setOpenId} />}
        {tab === 'sources' && <DataSourcesPanel />}
        {tab === 'manual' && <ManualDataPanel />}
        {tab === 'metrics' && <MetricsPanel />}
      </div>
    </div>
  );
}
