import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useCRMStore, type CRMField, type FieldType } from '../../store/crmStore';
import toast from 'react-hot-toast';

const FIELD_TYPES: { type: FieldType; label: string; emoji: string }[] = [
  { type: 'text',     label: 'Text',     emoji: '📝' },
  { type: 'textarea', label: 'Long Text', emoji: '📄' },
  { type: 'email',    label: 'Email',    emoji: '✉️' },
  { type: 'phone',    label: 'Phone',    emoji: '📞' },
  { type: 'number',   label: 'Number',   emoji: '🔢' },
  { type: 'date',     label: 'Date',     emoji: '📅' },
  { type: 'select',   label: 'Select',   emoji: '🔽' },
  { type: 'url',      label: 'URL',      emoji: '🔗' },
  { type: 'boolean',  label: 'Yes / No', emoji: '✅' },
];

interface Props {
  field?: CRMField | null;
  onClose: () => void;
}

export default function FieldEditorModal({ field, onClose }: Props) {
  const { createField, updateField } = useCRMStore();
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [required, setRequired] = useState(field?.required ?? false);
  const [saving, setSaving] = useState(false);

  const isEdit = !!field;

  const addOption = () => setOptions(o => [...o, '']);
  const updateOption = (i: number, val: string) => setOptions(o => o.map((x, j) => j === i ? val : x));
  const removeOption = (i: number) => setOptions(o => o.filter((_, j) => j !== i));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Field name is required'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await updateField(field!.id, { name: name.trim(), options, required });
        toast.success('Field updated');
      } else {
        await createField({ name: name.trim(), type, options, required });
        toast.success('Field created');
      }
      onClose();
    } catch {
      toast.error('Failed to save field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Field' : 'New Field'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Field Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Company Size" />
          </div>

          {/* Type — only for new fields */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Field Type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {FIELD_TYPES.map(ft => (
                  <button key={ft.type} onClick={() => setType(ft.type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      type === ft.type ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <span>{ft.emoji}</span> {ft.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options (select only) */}
          {type === 'select' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Options</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={opt} onChange={e => updateOption(i, e.target.value)}
                      className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                      placeholder={`Option ${i + 1}`} />
                    <button onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-500 p-1 rounded">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={addOption} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1">
                  <Plus size={14} /> Add option
                </button>
              </div>
            </div>
          )}

          {/* Required */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600" />
            <span className="text-sm text-gray-700">Required field</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create Field'}
          </button>
        </div>
      </div>
    </div>
  );
}
