import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, ExternalLink } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function LandingPageEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);
  const gjsInstance = useRef<any>(null);
  const [name, setName] = useState('Untitled Page');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const [grapesjs, presetModule] = await Promise.all([
        import('grapesjs'),
        import('grapesjs-preset-webpage'),
      ]);

      const preset = (presetModule as any).default ?? presetModule;

      if (!mounted || !editorRef.current) return;

      const editor = (grapesjs as any).default.init({
        container: editorRef.current,
        fromElement: false,
        height: '100%',
        width: 'auto',
        storageManager: false,
        plugins: [preset],
        pluginsOpts: { [preset as any]: {} },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px', widthMedia: '992px' },
            { name: 'Mobile', width: '375px', widthMedia: '480px' },
          ],
        },
      });

      gjsInstance.current = editor;

      // Load existing page or blank
      if (id && id !== 'new') {
        try {
          const { data } = await api.get(`/landing-pages/${id}`);
          if (!mounted) return;
          setName(data.name);
          setSlug(data.slug);
          setPageId(data.id);
          if (data.gjson) {
            editor.loadProjectData(JSON.parse(data.gjson));
          } else if (data.html) {
            editor.setComponents(data.html);
            editor.setStyle(data.css || '');
          }
        } catch {
          toast.error('Failed to load page');
        }
      }

      if (mounted) setReady(true);
    };

    init();

    return () => {
      mounted = false;
      if (gjsInstance.current) {
        gjsInstance.current.destroy();
        gjsInstance.current = null;
      }
    };
  }, []);

  const save = async () => {
    if (!gjsInstance.current) return;
    setSaving(true);
    try {
      const editor = gjsInstance.current;
      const html = editor.getHtml();
      const css = editor.getCss();
      const gjson = JSON.stringify(editor.getProjectData());

      if (pageId) {
        await api.put(`/landing-pages/${pageId}`, { name, html, css, gjson });
        toast.success('Saved');
      } else {
        const { data } = await api.post('/landing-pages', { name, html, css, gjson });
        setPageId(data.id);
        setSlug(data.slug);
        toast.success('Page created');
        navigate(`/marketing/design/landing-pages/${data.id}/edit`, { replace: true });
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 z-50">
        <button
          onClick={() => navigate('/marketing/design/landing-pages')}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-2 py-1.5 rounded hover:bg-gray-700 transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="w-px h-5 bg-gray-600" />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-gray-700 text-white text-sm px-3 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500 w-56"
          placeholder="Page name"
        />
        <div className="flex-1" />
        {slug && (
          <a
            href={`/api/landing-pages/pub/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded hover:bg-gray-700 transition-colors">
            <ExternalLink size={14} /> Preview
          </a>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-1.5 rounded font-medium transition-colors">
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* GrapesJS canvas */}
      <div className="flex-1 relative">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        <div ref={editorRef} className="w-full h-full" />
      </div>
    </div>
  );
}
