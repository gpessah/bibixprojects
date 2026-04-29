import { useState, useRef } from 'react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function TextCell({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ref = useRef<HTMLInputElement>(null);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || '')) onChange(draft || null);
  };

  if (editing) {
    return (
      <input ref={ref} autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
        className="w-full h-full px-2 text-sm outline-none bg-white border border-monday-blue" />
    );
  }

  return (
    <div onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="w-full h-full px-2 flex items-center text-sm text-gray-700 cursor-text hover:bg-gray-50 truncate">
      {value || ''}
    </div>
  );
}
