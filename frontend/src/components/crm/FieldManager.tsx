import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { useCRMStore, type CRMField } from '../../store/crmStore';
import FieldEditorModal from './FieldEditorModal';
import toast from 'react-hot-toast';

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  text:     { label: 'Text',      color: 'bg-gray-100 text-gray-600'   },
  textarea: { label: 'Long Text', color: 'bg-gray-100 text-gray-600'   },
  email:    { label: 'Email',     color: 'bg-blue-50 text-blue-600'    },
  phone:    { label: 'Phone',     color: 'bg-green-50 text-green-600'  },
  number:   { label: 'Number',    color: 'bg-purple-50 text-purple-600'},
  date:     { label: 'Date',      color: 'bg-yellow-50 text-yellow-600'},
  select:   { label: 'Select',    color: 'bg-orange-50 text-orange-600'},
  url:      { label: 'URL',       color: 'bg-indigo-50 text-indigo-600'},
  boolean:  { label: 'Yes / No',  color: 'bg-teal-50 text-teal-600'   },
};

export default function FieldManager() {
  const { fields, deleteField } = useCRMStore();
  const [editField, setEditField] = useState<CRMField | null | 'new'>('new' as unknown as null);
  const [showNew, setShowNew] = useState(false);

  const handleDelete = async (f: CRMField) => {
    if (!confirm(`Delete field "${f.name}"? This will remove it from all contacts.`)) return;
    try {
      await deleteField(f.id);
      toast.success('Field deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const sorted = [...fields].sort((a, b) => a.position - b.position);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Contact Fields</h2>
          <p className="text-sm text-gray-500 mt-0.5">Define the data you collect for each contact</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus size={15} /> Add Field
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_100px_80px_80px] text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div />
          <div>Field Name</div>
          <div>Type</div>
          <div className="text-center">Required</div>
          <div />
        </div>

        {sorted.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No fields yet. Add one above.</div>
        )}

        {sorted.map(field => {
          const badge = TYPE_BADGE[field.type] ?? { label: field.type, color: 'bg-gray-100 text-gray-600' };
          return (
            <div key={field.id} className="grid grid-cols-[32px_1fr_100px_80px_80px] items-center px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 group">
              <GripVertical size={14} className="text-gray-300" />
              <div>
                <span className="text-sm font-medium text-gray-800">{field.name}</span>
                <span className="ml-2 text-xs text-gray-400 font-mono">{field.field_key}</span>
              </div>
              <div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
              </div>
              <div className="text-center">
                {field.required
                  ? <span className="text-xs text-red-500 font-medium">Yes</span>
                  : <span className="text-xs text-gray-300">—</span>}
              </div>
              <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditField(field)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(field)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(showNew) && (
        <FieldEditorModal field={null} onClose={() => setShowNew(false)} />
      )}
      {editField && editField !== ('new' as unknown as null) && typeof editField === 'object' && (
        <FieldEditorModal field={editField} onClose={() => setEditField(null)} />
      )}
    </div>
  );
}
