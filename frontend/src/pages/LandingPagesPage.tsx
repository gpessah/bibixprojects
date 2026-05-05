import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ExternalLink, Pencil, Trash2, Copy, Layout } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  is_template: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLORS: Record<string, string> = {
  'Hero Landing Page': 'from-violet-500 to-purple-600',
  'Contact Page':      'from-blue-500 to-cyan-500',
  'Coming Soon':       'from-gray-700 to-gray-900',
  'Product Page':      'from-orange-400 to-rose-500',
  'Blank Page':        'from-gray-200 to-gray-300',
};

export default function LandingPagesPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/landing-pages');
      setPages(data);
    } catch { toast.error('Failed to load pages'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const duplicate = async (page: LandingPage) => {
    try {
      const { data: full } = await api.get(`/landing-pages/${page.id}`);
      const { data: newPage } = await api.post('/landing-pages', {
        name: page.is_template ? page.name : `${page.name} (copy)`,
        html: full.html,
        css: full.css,
        gjson: full.gjson,
      });
      navigate(`/marketing/design/landing-pages/${newPage.id}/edit`);
    } catch { toast.error('Failed to duplicate'); }
  };

  const deletePage = async (id: string) => {
    if (!confirm('Delete this page?')) return;
    await api.delete(`/landing-pages/${id}`);
    setPages(p => p.filter(x => x.id !== id));
    toast.success('Deleted');
  };

  const templates = pages.filter(p => p.is_template);
  const myPages = pages.filter(p => !p.is_template);

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Landing Pages</h1>
            <p className="text-gray-500 text-sm mt-1">Build and publish landing pages with drag & drop</p>
          </div>
          <button onClick={() => navigate('/marketing/design/landing-pages/new/edit')}
            className="flex items-center gap-2 px-4 py-2 bg-monday-blue text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
            <Plus size={16} /> New Page
          </button>
        </div>

        {/* Templates */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Start from a Template</h2>
          <div className="grid grid-cols-5 gap-4">
            {templates.map(t => (
              <button key={t.id} onClick={() => duplicate(t)}
                className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-monday-blue transition-all text-left">
                <div className={`bg-gradient-to-br ${TEMPLATE_COLORS[t.name] ?? 'from-blue-400 to-blue-600'} h-28 flex items-center justify-center`}>
                  <Layout size={36} className="text-white opacity-80 group-hover:scale-110 transition-transform" />
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold text-gray-800 truncate">{t.name}</div>
                  <div className="text-xs text-monday-blue mt-1 font-medium">Use template →</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* My Pages */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">My Pages</h2>
          {myPages.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
              <Layout size={48} className="text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium mb-1">No pages yet</p>
              <p className="text-gray-400 text-sm mb-6">Pick a template above or start from scratch</p>
              <button onClick={() => navigate('/marketing/design/landing-pages/new/edit')}
                className="px-4 py-2 bg-monday-blue text-white rounded-lg text-sm hover:bg-blue-600">
                Start from scratch
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-5">
              {myPages.map(p => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 h-36 flex items-center justify-center cursor-pointer group"
                    onClick={() => navigate(`/marketing/design/landing-pages/${p.id}/edit`)}>
                    <Layout size={40} className="text-gray-300 group-hover:text-monday-blue transition-colors" />
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => navigate(`/marketing/design/landing-pages/${p.id}/edit`)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-monday-blue text-white rounded-lg text-xs font-medium hover:bg-blue-600">
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => window.open(`/api/landing-pages/pub/${p.slug}`, '_blank')}
                        title="Preview" className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                        <ExternalLink size={13} />
                      </button>
                      <button onClick={() => duplicate(p)} title="Duplicate"
                        className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                        <Copy size={13} />
                      </button>
                      <button onClick={() => deletePage(p.id)} title="Delete"
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
    </div>
  );
}
