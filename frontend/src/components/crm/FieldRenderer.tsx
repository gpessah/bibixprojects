import type { CRMField } from '../../store/crmStore';

interface Props {
  field: CRMField;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function FieldRenderer({ field, value, onChange, readOnly }: Props) {
  const base = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          rows={3}
          className={base + ' resize-none'}
        />
      );

    case 'select':
      return (
        <select value={value} onChange={e => onChange(e.target.value)} disabled={readOnly} className={base}>
          <option value="">— select —</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={e => onChange(e.target.checked ? 'true' : 'false')}
            disabled={readOnly}
            className="w-4 h-4 rounded text-blue-600"
          />
          <span className="text-sm text-gray-600">{value === 'true' ? 'Yes' : 'No'}</span>
        </label>
      );

    case 'number':
      return (
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} className={base} />
      );

    case 'date':
      return (
        <input type="date" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} className={base} />
      );

    case 'email':
      return (
        <input type="email" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} placeholder="name@example.com" className={base} />
      );

    case 'phone':
      return (
        <input type="tel" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} placeholder="+1 555 000 0000" className={base} />
      );

    case 'url':
      return (
        <input type="url" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} placeholder="https://example.com" className={base} />
      );

    default: // text
      return (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          disabled={readOnly} className={base} />
      );
  }
}
