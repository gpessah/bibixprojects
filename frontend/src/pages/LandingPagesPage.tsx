import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ExternalLink, Pencil, Trash2, Copy, FileText } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  is_template: number;
  created_by: string;
  updated_at: string;
}

export default function LandingPagesPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/landing-pages');
      setPages(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load pages'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const deletePage = async (id: string) => {
    if (!confirm('Delete this page?')) return;
    try {
      await api.delete(`/landing-pages/${id}`);
      setPages(p => p.filter(x => x.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const duplicate = async (page: LandingPage) => {
    try {
      const { data: full } = await api.get(`/landing-pages/${page.id}`);
      const { data: newPage } = await api.post('/landing-pages', {
        name: `${page.name} (copy)`,
        sections: full.sections ? JSON.parse(full.sections) : undefined,
        theme: full.theme ? JSON.parse(full.theme) : undefined,
      });
      navigate(`/marketing/design/landing-pages/${newPage.id}/edit`);
    } catch { toast.error('Failed to duplicate'); }
  };

  const myPages = pages.filter(p => !p.is_template);

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Landing Pages</h1>
            <p className="text-gray-500 text-sm mt-1">AI-powered landing page builder</p>
          </div>
          <button
            onClick={() => navigate('/marketing/design/landing-pages/new/edit')}
            className="flex items-center gap-2 px-4 py-2 bg-monday-blue text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
            <Plus size={16} /> New Page
          </button>
        </div>

        {/* Pages grid */}
        {myPages.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-20 text-center">
            <FileText size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-1">No pages yet</p>
            <p className="text-gray-400 text-sm mb-6">Create your first AI-powered landing page</p>
            <button
              onClick={() => navigate('/marketing/design/landing-pages/new/edit')}
              className="px-5 py-2.5 bg-monday-blue text-white rounded-lg text-sm font-medium hover:bg-blue-600">
              Create a page
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {myPages.map(p => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div
                  className="bg-gradient-to-br from-gray-50 to-gray-100 h-36 flex items-center justify-center cursor-pointer group"
                  onClick={() => navigate(`/marketing/design/landing-pages/${p.id}/edit`)}>
                  <FileText size={40} className="text-gray-300 group-hover:text-monday-blue transition-colors" />
                </div>
                <div className="p-4">
                  <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Updated {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => navigate(`/marketing/design/landing-pages/${p.id}/edit`)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-monday-blue text-white rounded-lg text-xs font-medium hover:bg-blue-600">
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => window.open(`/api/landing-pages/pub/${p.slug}`, '_blank')}
                      title="Preview"
                      className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                      <ExternalLink size={13} />
                    </button>
                    <button
                      onClick={() => duplicate(p)}
                      title="Duplicate"
                      className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => deletePage(p.id)}
                      title="Delete"
                      className="px-3 py-2 border border-gray-200 text-red-400 rounded-lg text-xs hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
