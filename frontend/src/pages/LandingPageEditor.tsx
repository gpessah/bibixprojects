import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, ExternalLink, Plus, Trash2, ChevronUp, ChevronDown,
  Sparkles, Upload, Link2, Type, X, Loader2
} from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
  renderPage, defaultSection, SECTION_LABELS, SECTION_ICONS,
  type Section, type SectionType, type Theme
} from '../utils/sectionRenderer';

const DEFAULT_THEME: Theme = { primaryColor: '#4F46E5', fontFamily: 'system-ui,-apple-system,sans-serif' };

const ALL_SECTION_TYPES: SectionType[] = ['hero', 'features', 'testimonials', 'pricing', 'cta', 'contact', 'footer'];

// ── Setup screen ─────────────────────────────────────────────────────────────

type SetupMode = 'choose' | 'describe' | 'screenshot' | 'url';

function SetupScreen({ onReady }: { onReady: (sections: Section[], theme: Theme) => void }) {
  const [mode, setMode] = useState<SetupMode>('choose');
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = async () => {
    setLoading(true);
    try {
      let res;
      if (mode === 'describe') {
        res = await api.post('/landing-pages/ai/generate', { description });
      } else if (mode === 'url') {
        res = await api.post('/landing-pages/ai/analyze-url', { url });
      } else if (mode === 'screenshot' && imageFile) {
        const base64 = await fileToBase64(imageFile);
        res = await api.post('/landing-pages/ai/analyze-screenshot', {
          imageBase64: base64,
          mimeType: imageFile.type,
        });
      }
      if (res?.data?.sections) {
        onReady(res.data.sections, res.data.theme || DEFAULT_THEME);
      } else {
        toast.error('AI returned unexpected response, starting blank');
        onReady([defaultSection('hero'), defaultSection('footer')], DEFAULT_THEME);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'AI generation failed');
    } finally {
      setLoading(false);
    }
  };

  const startBlank = () => onReady([defaultSection('hero'), defaultSection('cta'), defaultSection('footer')], DEFAULT_THEME);

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        {mode === 'choose' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Create a Landing Page</h2>
            <p className="text-gray-500 text-sm text-center mb-8">How would you like to start?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('describe')}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group">
                <div className="text-3xl">✍️</div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Describe your business</div>
                  <div className="text-xs text-gray-500 mt-0.5">AI writes everything for you</div>
                </div>
              </button>
              <button onClick={() => setMode('screenshot')}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left">
                <div className="text-3xl">📸</div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Upload a screenshot</div>
                  <div className="text-xs text-gray-500 mt-0.5">AI clones the layout</div>
                </div>
              </button>
              <button onClick={() => setMode('url')}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left">
                <div className="text-3xl">🔗</div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Paste a URL</div>
                  <div className="text-xs text-gray-500 mt-0.5">AI reads and clones the page</div>
                </div>
              </button>
              <button onClick={startBlank}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left">
                <div className="text-3xl">⬜</div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Start blank</div>
                  <div className="text-xs text-gray-500 mt-0.5">Build from scratch</div>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === 'describe' && (
          <>
            <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Describe your business</h2>
            <p className="text-gray-500 text-sm mb-4">The more detail, the better. Include what you sell, who it's for, and what makes you different.</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. We sell handmade leather shoes in Barcelona. Our shoes are crafted by master artisans using traditional techniques. Target audience: professionals aged 30-50 who value quality and craftsmanship."
              rows={5}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-indigo-400 mb-4"
            />
            <button onClick={generate} disabled={loading || !description.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Sparkles size={16} /> Generate Page</>}
            </button>
          </>
        )}

        {mode === 'screenshot' && (
          <>
            <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Upload a screenshot</h2>
            <p className="text-gray-500 text-sm mb-4">Take a screenshot of any landing page and AI will recreate its structure.</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all mb-4">
              {imageFile ? (
                <div className="text-sm text-gray-700 font-medium">{imageFile.name}</div>
              ) : (
                <>
                  <Upload size={28} className="text-gray-300 mx-auto mb-2" />
                  <div className="text-sm text-gray-500">Click to upload image</div>
                </>
              )}
            </div>
            <button onClick={generate} disabled={loading || !imageFile}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Analyzing...</> : <><Sparkles size={16} /> Analyze & Build</>}
            </button>
          </>
        )}

        {mode === 'url' && (
          <>
            <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Clone from URL</h2>
            <p className="text-gray-500 text-sm mb-4">Paste the URL of a landing page you like. AI will analyze it and recreate the structure.</p>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/landing"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 mb-4"
            />
            <button onClick={generate} disabled={loading || !url.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Analyzing...</> : <><Link2 size={16} /> Analyze & Build</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section edit panel ────────────────────────────────────────────────────────

function EditPanel({ section, theme, onChange, onClose }: {
  section: Section;
  theme: Theme;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
}) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const d = section.data;

  const set = (key: string, val: any) => onChange({ ...d, [key]: val });

  const setItem = (arrKey: string, idx: number, itemKey: string, val: any) => {
    const arr = [...(d[arrKey] || [])];
    arr[idx] = { ...arr[idx], [itemKey]: val };
    onChange({ ...d, [arrKey]: arr });
  };

  const addItem = (arrKey: string, blank: object) => onChange({ ...d, [arrKey]: [...(d[arrKey] || []), blank] });

  const removeItem = (arrKey: string, idx: number) => {
    const arr = [...(d[arrKey] || [])];
    arr.splice(idx, 1);
    onChange({ ...d, [arrKey]: arr });
  };

  const aiRewrite = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await api.post('/landing-pages/ai/rewrite-section', { section, instruction: aiPrompt, theme });
      onChange(data.data);
      setAiPrompt('');
      toast.success('Section updated');
    } catch { toast.error('AI rewrite failed'); }
    finally { setAiLoading(false); }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400';
  const textareaCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide';

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-800 text-sm">{SECTION_ICONS[section.type]} {SECTION_LABELS[section.type]}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* AI Rewrite */}
        <div className="bg-indigo-50 rounded-xl p-3">
          <div className={labelCls} style={{ color: '#4F46E5' }}>✨ AI Rewrite</div>
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder='e.g. "Make this more urgent" or "Rewrite for a younger audience"'
            rows={2}
            className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400 resize-none mb-2"
          />
          <button onClick={aiRewrite} disabled={aiLoading || !aiPrompt.trim()}
            className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-semibold">
            {aiLoading ? <><Loader2 size={12} className="animate-spin" /> Rewriting...</> : <><Sparkles size={12} /> Rewrite</>}
          </button>
        </div>

        {/* Hero fields */}
        {section.type === 'hero' && <>
          <div><label className={labelCls}>Headline</label><input className={inputCls} value={d.headline || ''} onChange={e => set('headline', e.target.value)} /></div>
          <div><label className={labelCls}>Subheadline</label><textarea className={textareaCls} rows={3} value={d.subheadline || ''} onChange={e => set('subheadline', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Button Text</label><input className={inputCls} value={d.ctaText || ''} onChange={e => set('ctaText', e.target.value)} /></div>
            <div><label className={labelCls}>Button URL</label><input className={inputCls} value={d.ctaUrl || ''} onChange={e => set('ctaUrl', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>2nd Button</label><input className={inputCls} value={d.secondaryCtaText || ''} onChange={e => set('secondaryCtaText', e.target.value)} placeholder="Optional" /></div>
            <div><label className={labelCls}>2nd URL</label><input className={inputCls} value={d.secondaryCtaUrl || ''} onChange={e => set('secondaryCtaUrl', e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Background</label><input type="color" className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" value={d.backgroundColor || '#4F46E5'} onChange={e => set('backgroundColor', e.target.value)} /></div>
            <div><label className={labelCls}>Text Color</label><input type="color" className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" value={d.textColor || '#ffffff'} onChange={e => set('textColor', e.target.value)} /></div>
          </div>
        </>}

        {/* Features fields */}
        {section.type === 'features' && <>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={d.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div><label className={labelCls}>Subtitle</label><input className={inputCls} value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ marginBottom: 0 }}>Features</label>
              <button onClick={() => addItem('items', { icon: '✨', title: 'Feature', description: 'Description' })} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-0.5"><Plus size={12} /> Add</button>
            </div>
            {(d.items || []).map((item: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 mb-2 space-y-2">
                <div className="flex gap-2">
                  <input className={`${inputCls} w-14 text-center text-lg p-1`} value={item.icon || ''} onChange={e => setItem('items', i, 'icon', e.target.value)} />
                  <input className={`${inputCls} flex-1`} value={item.title || ''} onChange={e => setItem('items', i, 'title', e.target.value)} placeholder="Title" />
                  <button onClick={() => removeItem('items', i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
                <textarea className={textareaCls} rows={2} value={item.description || ''} onChange={e => setItem('items', i, 'description', e.target.value)} placeholder="Description" />
              </div>
            ))}
          </div>
        </>}

        {/* Testimonials */}
        {section.type === 'testimonials' && <>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={d.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ marginBottom: 0 }}>Testimonials</label>
              <button onClick={() => addItem('items', { quote: 'Great product!', name: 'Name', role: 'Role', company: 'Company' })} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-0.5"><Plus size={12} /> Add</button>
            </div>
            {(d.items || []).map((item: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 mb-2 space-y-2">
                <div className="flex gap-1">
                  <textarea className={`${textareaCls} flex-1`} rows={2} value={item.quote || ''} onChange={e => setItem('items', i, 'quote', e.target.value)} placeholder="Quote" />
                  <button onClick={() => removeItem('items', i)} className="text-red-400 hover:text-red-600 self-start mt-1"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <input className={inputCls} value={item.name || ''} onChange={e => setItem('items', i, 'name', e.target.value)} placeholder="Name" />
                  <input className={inputCls} value={item.role || ''} onChange={e => setItem('items', i, 'role', e.target.value)} placeholder="Role" />
                  <input className={inputCls} value={item.company || ''} onChange={e => setItem('items', i, 'company', e.target.value)} placeholder="Company" />
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* Pricing */}
        {section.type === 'pricing' && <>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={d.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div><label className={labelCls}>Subtitle</label><input className={inputCls} value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ marginBottom: 0 }}>Plans</label>
              <button onClick={() => addItem('plans', { name: 'New Plan', price: '$0', period: '/month', features: ['Feature 1'], highlighted: false, ctaText: 'Get Started' })} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-0.5"><Plus size={12} /> Add</button>
            </div>
            {(d.plans || []).map((plan: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 mb-2 space-y-2">
                <div className="flex items-center gap-1">
                  <input className={`${inputCls} flex-1`} value={plan.name || ''} onChange={e => setItem('plans', i, 'name', e.target.value)} placeholder="Plan name" />
                  <button onClick={() => removeItem('plans', i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <input className={inputCls} value={plan.price || ''} onChange={e => setItem('plans', i, 'price', e.target.value)} placeholder="$29" />
                  <input className={inputCls} value={plan.period || ''} onChange={e => setItem('plans', i, 'period', e.target.value)} placeholder="/month" />
                </div>
                <input className={inputCls} value={plan.ctaText || ''} onChange={e => setItem('plans', i, 'ctaText', e.target.value)} placeholder="Button text" />
                <textarea className={textareaCls} rows={3} value={(plan.features || []).join('\n')} onChange={e => setItem('plans', i, 'features', e.target.value.split('\n'))} placeholder="One feature per line" />
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={!!plan.highlighted} onChange={e => setItem('plans', i, 'highlighted', e.target.checked)} />
                  Highlighted plan
                </label>
              </div>
            ))}
          </div>
        </>}

        {/* CTA */}
        {section.type === 'cta' && <>
          <div><label className={labelCls}>Headline</label><input className={inputCls} value={d.headline || ''} onChange={e => set('headline', e.target.value)} /></div>
          <div><label className={labelCls}>Subheadline</label><textarea className={textareaCls} rows={2} value={d.subheadline || ''} onChange={e => set('subheadline', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Button Text</label><input className={inputCls} value={d.ctaText || ''} onChange={e => set('ctaText', e.target.value)} /></div>
            <div><label className={labelCls}>Button URL</label><input className={inputCls} value={d.ctaUrl || ''} onChange={e => set('ctaUrl', e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>Background</label><input type="color" className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" value={d.backgroundColor || '#4F46E5'} onChange={e => set('backgroundColor', e.target.value)} /></div>
        </>}

        {/* Contact */}
        {section.type === 'contact' && <>
          <div><label className={labelCls}>Title</label><input className={inputCls} value={d.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div><label className={labelCls}>Subtitle</label><input className={inputCls} value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} /></div>
          <div><label className={labelCls}>Submit Button Text</label><input className={inputCls} value={d.submitText || ''} onChange={e => set('submitText', e.target.value)} /></div>
        </>}

        {/* Footer */}
        {section.type === 'footer' && <>
          <div><label className={labelCls}>Logo / Brand Name</label><input className={inputCls} value={d.logo || ''} onChange={e => set('logo', e.target.value)} /></div>
          <div><label className={labelCls}>Tagline</label><input className={inputCls} value={d.tagline || ''} onChange={e => set('tagline', e.target.value)} /></div>
          <div><label className={labelCls}>Copyright</label><input className={inputCls} value={d.copyright || ''} onChange={e => set('copyright', e.target.value)} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ marginBottom: 0 }}>Links</label>
              <button onClick={() => addItem('links', { label: 'Link', url: '#' })} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-0.5"><Plus size={12} /> Add</button>
            </div>
            {(d.links || []).map((link: any, i: number) => (
              <div key={i} className="flex gap-1 mb-1">
                <input className={`${inputCls} flex-1`} value={link.label || ''} onChange={e => setItem('links', i, 'label', e.target.value)} placeholder="Label" />
                <input className={`${inputCls} flex-1`} value={link.url || ''} onChange={e => setItem('links', i, 'url', e.target.value)} placeholder="URL" />
                <button onClick={() => removeItem('links', i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
              </div>
            ))}
          </div>
        </>}

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function LandingPageEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [sections, setSections] = useState<Section[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [name, setName] = useState('Untitled Page');
  const [slug, setSlug] = useState('');
  const [pageId, setPageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    if (id && id !== 'new') {
      api.get(`/landing-pages/${id}`).then(({ data }) => {
        setName(data.name);
        setSlug(data.slug);
        setPageId(data.id);
        if (data.sections) {
          try { setSections(JSON.parse(data.sections)); } catch (_) {}
        }
        if (data.theme) {
          try { setTheme(JSON.parse(data.theme)); } catch (_) {}
        }
        setInitialized(true);
      }).catch(() => { toast.error('Failed to load page'); setInitialized(true); });
    } else {
      setInitialized(true);
    }
  }, []);

  const pageHTML = useMemo(() => renderPage(sections, theme, name), [sections, theme, name]);

  const save = async () => {
    setSaving(true);
    try {
      if (pageId) {
        await api.put(`/landing-pages/${pageId}`, { name, sections, theme });
        toast.success('Saved');
      } else {
        const { data } = await api.post('/landing-pages', { name, sections, theme });
        setPageId(data.id);
        setSlug(data.slug);
        toast.success('Page created');
        navigate(`/marketing/design/landing-pages/${data.id}/edit`, { replace: true });
      }
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSections(next);
  };

  const deleteSection = (id: string) => {
    setSections(s => s.filter(x => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addSection = (type: SectionType) => {
    setSections(s => [...s, defaultSection(type)]);
    setShowAddMenu(false);
  };

  const updateSectionData = useCallback((id: string, data: Record<string, any>) => {
    setSections(s => s.map(x => x.id === id ? { ...x, data } : x));
  }, []);

  const selectedSection = sections.find(s => s.id === selectedId) || null;

  // New page: not yet initialized with sections → show setup
  if (initialized && sections.length === 0 && !pageId) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
          <button onClick={() => navigate('/marketing/design/landing-pages')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm px-2 py-1.5 rounded hover:bg-gray-100">
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <input value={name} onChange={e => setName(e.target.value)}
            className="bg-gray-100 text-gray-800 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-indigo-400 w-48" />
        </div>
        <SetupScreen onReady={(s, t) => { setSections(s); setTheme(t); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <button onClick={() => navigate('/marketing/design/landing-pages')}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm px-2 py-1.5 rounded hover:bg-gray-100">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <input value={name} onChange={e => setName(e.target.value)}
          className="bg-gray-100 text-gray-800 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-indigo-400 w-48" />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Primary color</label>
          <input type="color" value={theme.primaryColor}
            onChange={e => setTheme(t => ({ ...t, primaryColor: e.target.value }))}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
        </div>
        {slug && (
          <a href={`/api/landing-pages/pub/${slug}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm px-3 py-1.5 rounded hover:bg-gray-100">
            <ExternalLink size={14} /> Preview
          </a>
        )}
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm px-4 py-1.5 rounded-lg font-medium">
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: section list */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sections</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sections.map((s, i) => (
              <div key={s.id}
                onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors ${selectedId === s.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                <span className="text-base">{SECTION_ICONS[s.type]}</span>
                <span className="flex-1 truncate font-medium text-xs">{SECTION_LABELS[s.type]}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={e => { e.stopPropagation(); moveSection(i, -1); }} className="p-0.5 hover:text-indigo-600"><ChevronUp size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); moveSection(i, 1); }} className="p-0.5 hover:text-indigo-600"><ChevronDown size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); deleteSection(s.id); }} className="p-0.5 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-gray-100 relative">
            <button onClick={() => setShowAddMenu(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 text-xs font-medium transition-colors">
              <Plus size={14} /> Add Section
            </button>
            {showAddMenu && (
              <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                {ALL_SECTION_TYPES.map(type => (
                  <button key={type} onClick={() => addSection(type)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-sm text-gray-700 hover:text-indigo-700">
                    <span>{SECTION_ICONS[type]}</span> {SECTION_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: iframe preview */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ minHeight: '600px' }}>
            <iframe
              srcDoc={pageHTML}
              title="Page preview"
              style={{ width: '100%', height: '100%', minHeight: '700px', border: 'none', display: 'block' }}
            />
          </div>
        </div>

        {/* Right: edit panel */}
        {selectedSection && (
          <EditPanel
            section={selectedSection}
            theme={theme}
            onChange={data => updateSectionData(selectedSection.id, data)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
