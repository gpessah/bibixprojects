import { Check } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function CheckboxCell({ value, onChange }: Props) {
  const checked = value === 'true';
  return (
    <div className="w-full h-full flex items-center justify-center">
      <button onClick={() => onChange(checked ? 'false' : 'true')}
        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${checked ? 'bg-monday-green border-monday-green' : 'border-gray-300 hover:border-monday-blue'}`}>
        {checked && <Check size={12} className="text-white" strokeWidth={3} />}
      </button>
    </div>
  );
}
