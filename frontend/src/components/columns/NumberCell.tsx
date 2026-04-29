import { useState } from 'react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function NumberCell({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const num = parseFloat(draft);
    onChange(isNaN(num) ? null : String(num));
  };

  if (editing) {
    return (
      <input autoFocus type="number" value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full h-full px-2 text-sm text-right outline-none bg-white border border-monday-blue" />
    );
  }

  return (
    <div onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="w-full h-full px-2 flex items-center justify-end text-sm text-gray-700 cursor-text hover:bg-gray-50">
      {value || ''}
    </div>
  );
}
