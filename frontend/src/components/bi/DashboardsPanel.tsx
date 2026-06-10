import { useEffect, useState } from 'react';
import { Plus, LayoutDashboard, Copy, Trash2, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import biApi from '../../api/bi';
import { useBiStore } from '../../store/biStore';

export default function DashboardsPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { dashboards, templates, loadDashboards, loadAll } = useBiStore();
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => { loadDashboards(); }, []);

  const createFrom = async (templateId?: string) => {
    const d = await biApi.createDashboard(templateId ? { templateId } : { name: 'New dashboard' });
    setShowGallery(false); await loadDashboards(); onOpen(d.id);
  };
  const duplicate = async (id: string) => { const d = await biApi.duplicateDashboard(id); await loadDashboards(); onOpen(d.id); };
  const remove = async (id: string) => { if (!confirm('Delete this dashboard?')) return; await biApi.deleteDashboard(id); await loadDashboards(); toast.success('Deleted'); };

  return (
    <div className="p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <button onClick={() => { loadAll(); setShowGallery(true); }}
          className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/40">
          <Plus size={28} /> <span className="text-sm font-medium">New dashboard</span>
        </button>
        {dashboards.map((d) => (
          <div key={d.id} className="group relative h-40 rounded-xl bg-white border border-gray-200 hover:shadow-md cursor-pointer overflow-hidden" onClick={() => onOpen(d.id)}>
            <div className="h-24 flex items-center justify-center" style={{ background: d.theme?.background || '#f1f5f9' }}>
              <div className="flex gap-1">{(d.theme?.palette || ['#2563eb', '#0ea5e9', '#14b8a6']).slice(0, 4).map((c, i) => <span key={i} className="w-8 rounded" style={{ background: c, height: 20 + i * 8 }} />)}</div>
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5"><LayoutDashboard size={14} className="text-gray-400" /> {d.name}</div>
              <div className="text-xs text-gray-400 truncate">{d.description || 'No description'}</div>
            </div>
            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => duplicate(d.id)} className="p-1.5 bg-white/90 rounded-lg shadow text-gray-500 hover:text-gray-800"><Copy size={13} /></button>
              <button onClick={() => remove(d.id)} className="p-1.5 bg-white/90 rounded-lg shadow text-gray-500 hover:text-red-500"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {showGallery && (
        <Modal title="Start from a template" onClose={() => setShowGallery(false)} size="lg">
          <div className="p-6 grid grid-cols-2 gap-4">
            {templates.map((t) => (
              <button key={t.id} onClick={() => createFrom(t.id)} className="text-left p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40">
                <div className="h-16 rounded-lg mb-3 flex items-center justify-center" style={{ background: t.theme?.background || '#f1f5f9' }}>
                  <div className="flex gap-1 items-end">{(t.theme?.palette || []).slice(0, 5).map((c, i) => <span key={i} className="w-5 rounded" style={{ background: c, height: 16 + (i % 3) * 10 }} />)}</div>
                </div>
                <div className="text-sm font-semibold text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                <div className="text-[11px] text-gray-400 mt-1">{t.widgetCount} widgets</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
