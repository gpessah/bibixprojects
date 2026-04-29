import { useState, useRef, useEffect } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar, X } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

/** Parse DD/MM/YYYY or YYYY-MM-DD → ISO string 'YYYY-MM-DD', or null on failure. */
function parseDateInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // DD/MM/YYYY or D/M/YYYY (also accepts - or . as separators)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const dt  = parseISO(iso);
    return isValid(dt) ? iso : null;
  }

  // YYYY-MM-DD (also native <input type="date"> output)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = parseISO(s);
    return isValid(dt) ? s : null;
  }

  return null;
}

export default function DateCell({ value, onChange }: Props) {
  const [open, setOpen]       = useState(false);
  const [text, setText]       = useState('');
  const [inputError, setInputError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Format stored ISO value → DD/MM/YYYY for display
  const display = value ? (() => {
    try { return format(parseISO(value), 'dd/MM/yyyy'); } catch { return value; }
  })() : '';

  // Initialise text field when opening
  const openPopup = () => {
    setText(display); // pre-fill with current value
    setInputError(false);
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      onChange(null);
      setOpen(false);
      return;
    }
    const iso = parseDateInput(raw);
    if (iso) {
      onChange(iso);
      setOpen(false);
      setInputError(false);
    } else {
      setInputError(true); // flash error but keep popup open
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(text); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  const handleNativePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Native picker always gives YYYY-MM-DD
    const iso = e.target.value || null;
    onChange(iso);
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      {/* ── Cell button ─────────────────────────────────────────────────── */}
      <button
        onClick={openPopup}
        className="w-full h-full flex items-center justify-center gap-1 text-xs text-gray-600 hover:bg-gray-50 group"
      >
        {value ? (
          <>
            <Calendar size={12} className="text-gray-400 flex-shrink-0" />
            <span>{display}</span>
            <span
              role="button"
              onClick={clear}
              className="ml-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-opacity leading-none"
            >
              <X size={11} />
            </span>
          </>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </button>

      {/* ── Popup ───────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52">
          {/* Text input (DD/MM/YYYY) */}
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Date (DD/MM/YYYY)
          </label>
          <input
            autoFocus
            type="text"
            value={text}
            onChange={e => { setText(e.target.value); setInputError(false); }}
            onKeyDown={handleKeyDown}
            onBlur={() => text.trim() && commit(text)}
            placeholder="DD/MM/YYYY"
            className={[
              'w-full text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 transition-colors',
              inputError
                ? 'border-red-400 ring-red-200 bg-red-50 text-red-700 placeholder-red-300'
                : 'border-gray-200 focus:ring-monday-blue/30 focus:border-monday-blue',
            ].join(' ')}
          />
          {inputError && (
            <p className="text-[10px] text-red-500 mt-1">Use DD/MM/YYYY (e.g. 31/12/2024)</p>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2 my-2.5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[10px] text-gray-400">or pick</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Native date picker */}
          <input
            type="date"
            value={value || ''}
            onChange={handleNativePicker}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue transition-colors"
          />

          {/* Clear */}
          {value && (
            <button
              onClick={clear}
              className="mt-2.5 w-full text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}
