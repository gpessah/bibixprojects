import { useState, useRef, useEffect } from 'react';
import type { StatusOption } from '../../types';

interface Props {
  value: string | null;
  options: StatusOption[];
  onChange: (value: string | null) => void;
  compact?: boolean;
}

export default function StatusCell({ value, options, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.label === value);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative w-full h-full">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full h-full flex items-center justify-center font-medium text-white text-xs ${compact ? 'rounded px-1 py-0.5' : ''}`}
        style={{ backgroundColor: current?.color || '#c4c4c4' }}
      >
        {current?.label || ''}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] mt-0.5">
          {options.map(opt => (
            <button key={opt.label} onClick={() => { onChange(opt.label); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          ))}
          <button onClick={() => { onChange(null); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-gray-400 border-t border-gray-100">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
