import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function LinkCell({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    onChange(draft.trim() || null);
  };

  if (editing) {
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="https://..." className="w-full h-full px-2 text-sm outline-none bg-white border border-monday-blue" />
    );
  }

  return (
    <div className="w-full h-full flex items-center px-2 gap-1">
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-monday-blue text-xs hover:underline flex items-center gap-1 truncate" onClick={e => e.stopPropagation()}>
          <ExternalLink size={11} /><span className="truncate">{value.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : (
        <button onClick={() => { setDraft(''); setEditing(true); }} className="text-gray-300 text-xs hover:text-gray-500 w-full text-left">—</button>
      )}
      {value && <button onClick={() => { setDraft(value); setEditing(true); }} className="ml-auto text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">Edit</button>}
    </div>
  );
}
