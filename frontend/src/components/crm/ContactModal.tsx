import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useCRMStore, type CRMContact, type CRMField } from '../../store/crmStore';
import FieldRenderer from './FieldRenderer';
import toast from 'react-hot-toast';

interface Props {
  contact?: CRMContact | null;
  fields: CRMField[];
  onClose: () => void;
}

export default function ContactModal({ contact, fields, onClose }: Props) {
  const { createContact, updateContact } = useCRMStore();
  const [values, setValues] = useState<Record<string, string>>(contact?.values ?? {});
  const [saving, setSaving] = useState(false);

  const isEdit = !!contact;

  const set = (key: string, val: string) => setValues(v => ({ ...v, [key]: val }));

  const handleSave = async () => {
    // Validate required
    const missing = fields.filter(f => f.required && !values[f.field_key]?.trim());
    if (missing.length) {
      toast.error(`Required: ${missing.map(f => f.name).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateContact(contact!.id, values);
        toast.success('Contact updated');
      } else {
        await createContact({ values });
        toast.success('Contact created');
      }
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {isEdit ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {fields.map(field => (
            <div key={field.id}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                {field.name}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <FieldRenderer
                field={field}
                value={values[field.field_key] ?? ''}
                onChange={val => set(field.field_key, val)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}
