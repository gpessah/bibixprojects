import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

const TAG_COLORS = ['#0073ea','#e2445c','#00c875','#fdab3d','#a25ddc','#037f4c'];

export default function TagsCell({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  let tags: string[] = [];
  try { tags = value ? JSON.parse(value) : []; if (!Array.isArray(tags)) tags = []; } catch { tags = []; }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addTag = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange(JSON.stringify([...tags, t]));
    setInput('');
  };

  const removeTag = (tag: string) => onChange(tags.length === 1 ? null : JSON.stringify(tags.filter(t => t !== tag)));

  return (
    <div ref={ref} className="relative w-full h-full">
      <div onClick={() => setOpen(o => !o)}
        className="w-full h-full flex items-center gap-1 px-1 flex-wrap cursor-pointer hover:bg-gray-50 overflow-hidden">
        {tags.map((tag, i) => (
          <span key={tag} className="px-1.5 py-0.5 rounded text-white text-xs font-medium flex items-center gap-1"
            style={{ backgroundColor: TAG_COLORS[i % TAG_COLORS.length] }}>
            {tag}
            <button onClick={e => { e.stopPropagation(); removeTag(tag); }} className="hover:opacity-70"><X size={10} /></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-gray-300 text-xs ml-1">—</span>}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 mt-0.5 min-w-[180px]">
          <div className="flex gap-1">
            <input autoFocus value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="New tag..." className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-monday-blue" />
            <button onClick={addTag} className="p-1 bg-monday-blue text-white rounded hover:bg-blue-600"><Plus size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
