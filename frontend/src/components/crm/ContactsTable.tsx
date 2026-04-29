import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Trash2, ChevronUp, ChevronDown, Columns, X, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import { useCRMStore, type CRMContact, type CRMField } from '../../store/crmStore';
import Avatar from '../ui/Avatar';
import toast from 'react-hot-toast';

// ── Column definitions ─────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  width: number;
  sortKey?: string;
  render: (c: CRMContact, fields: CRMField[]) => React.ReactNode;
}

const SYSTEM_COLS: ColDef[] = [
  {
    key: '__id',
    label: 'ID',
    width: 80,
    render: (c) => (
      <span className="text-xs font-mono text-gray-500">
        {c.contact_num ? `#${c.contact_num}` : c.id.slice(0, 6).toUpperCase()}
      </span>
    ),
  },
  {
    key: '__full_name',
    label: 'Full Name',
    width: 160,
    sortKey: 'first_name',
    render: (c) => {
      const first = c.values['first_name'] || '';
      const last = c.values['last_name'] || '';
      const full = [first, last].filter(Boolean).join(' ') || c.values['name'] || '—';
      return <span className="font-medium text-gray-800">{full}</span>;
    },
  },
  {
    key: '__assigned',
    label: 'Assigned To',
    width: 140,
    render: (c) =>
      c.assigned_user ? (
        <div className="flex items-center gap-1.5">
          <Avatar name={c.assigned_user.name} color={c.assigned_user.avatar_color} size="xs" />
          <span className="text-xs text-gray-600 truncate">{c.assigned_user.name}</span>
        </div>
      ) : (
        <span className="text-xs text-gray-300 italic">Unassigned</span>
      ),
  },
  {
    key: '__created',
    label: 'Created',
    width: 110,
    sortKey: 'created_at',
    render: (c) => (
      <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
    ),
  },
];

const DEFAULT_VISIBLE = [
  '__id', '__full_name', 'email', 'phone', 'country',
  'contact_status', 'kyc_status', 'affiliate', 'referring_affiliate',
  'utm_campaign', '__assigned',
];
const STORAGE_KEY = 'crm_visible_columns';

function loadVisibleCols(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    registered: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-500',
    banned: 'bg-red-100 text-red-700',
    'no kyc': 'bg-yellow-100 text-yellow-700',
    pending: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    new: 'bg-sky-100 text-sky-700',
    interested: 'bg-purple-100 text-purple-700',
    converted: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-600',
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  };
  const color = colors[value?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
  return value ? (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${color}`}>{value}</span>
  ) : <span className="text-gray-300">—</span>;
}

// ── Column Picker ─────────────────────────────────────────────────────────────

interface ColumnPickerProps {
  fields: CRMField[];
  visible: string[];
  onChange: (cols: string[]) => void;
  onClose: () => void;
}

function ColumnPicker({ fields, visible, onChange, onClose }: ColumnPickerProps) {
  const sections = [
    { label: 'System', cols: SYSTEM_COLS.map(c => ({ key: c.key, label: c.label })) },
    { label: 'General', cols: fields.filter(f => f.field_group === 'general').map(f => ({ key: f.field_key, label: f.name })) },
    { label: 'Tracking', cols: fields.filter(f => f.field_group === 'tracking').map(f => ({ key: f.field_key, label: f.name })) },
    { label: 'Sales', cols: fields.filter(f => f.field_group === 'sales').map(f => ({ key: f.field_key, label: f.name })) },
  ].filter(s => s.cols.length > 0);

  const toggle = (key: string) => {
    const next = visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key];
    onChange(next);
  };

  return (
    <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Visible Columns</span>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={14} /></button>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        {sections.map(section => (
          <div key={section.label} className="mb-2">
            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{section.label}</div>
            {section.cols.map(col => (
              <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visible.includes(col.key)}
                  onChange={() => toggle(col.key)}
                  className="rounded text-monday-blue"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onOpenContact: (contact: CRMContact) => void;
  onNewContact: () => void;
}

export default function ContactsTable({ onOpenContact, onNewContact }: Props) {
  const { contacts, contactsTotal, contactsLoading, query, loadContacts, deleteContact, fields } = useCRMStore();
  const [search, setSearch] = useState('');
  const [visibleCols, setVisibleCols] = useState<string[]>(loadVisibleCols);
  const [showColPicker, setShowColPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(contactsTotal / PAGE_SIZE));

  useEffect(() => {
    loadContacts({ search: '', page: 1 });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    loadContacts({ search: val, page: 1 });
  }, [loadContacts]);

  const handleSort = (key: string) => {
    const isActive = query.sort === key;
    loadContacts({ sort: key, dir: isActive && query.dir === 'asc' ? 'desc' : 'asc', page: 1 });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this contact?')) return;
    try {
      await deleteContact(id);
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleColsChange = (cols: string[]) => {
    setVisibleCols(cols);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  };

  // Build active column definitions
  const fieldColDefs: ColDef[] = fields.map(f => ({
    key: f.field_key,
    label: f.name,
    width: 140,
    sortKey: f.field_key,
    render: (c) => {
      const val = c.values[f.field_key] || '';
      if (!val) return <span className="text-gray-300 text-xs">—</span>;
      if (f.type === 'select') return <StatusBadge value={val} />;
      if (f.type === 'boolean') return <span className="text-xs text-gray-600">{val === 'true' ? '✓ Yes' : '✗ No'}</span>;
      if (f.type === 'email') return (
        <a href={`mailto:${val}`} className="text-blue-600 hover:underline text-xs" onClick={e => e.stopPropagation()}>{val}</a>
      );
      if (f.type === 'phone') return (
        <a href={`tel:${val}`} className="text-blue-600 hover:underline text-xs" onClick={e => e.stopPropagation()}>{val}</a>
      );
      return <span className="text-xs text-gray-700 truncate block max-w-[180px]">{val}</span>;
    },
  }));

  const allColDefs = [...SYSTEM_COLS, ...fieldColDefs];
  const activeCols = allColDefs.filter(c => visibleCols.includes(c.key));

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
          />
          {search && (
            <button onClick={() => handleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowColPicker(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${showColPicker ? 'bg-blue-50 border-monday-blue text-monday-blue' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Columns size={14} /> Columns
            </button>
            {showColPicker && (
              <ColumnPicker
                fields={fields}
                visible={visibleCols}
                onChange={handleColsChange}
                onClose={() => setShowColPicker(false)}
              />
            )}
          </div>

          <button
            onClick={onNewContact}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600"
          >
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: activeCols.reduce((s, c) => s + c.width, 0) + 80 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              {activeCols.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width, minWidth: col.width }}
                  className="px-3 py-2.5 text-left"
                >
                  {col.sortKey ? (
                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort(col.sortKey!)}
                    >
                      {col.label}
                      {query.sort === col.sortKey
                        ? (query.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                        : <ChevronDown size={11} className="opacity-30" />
                      }
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{col.label}</span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2.5 sticky right-0 bg-gray-50 border-l border-gray-100" style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {contactsLoading ? (
              <tr>
                <td colSpan={activeCols.length + 1} className="py-20 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin w-6 h-6 border-2 border-monday-blue border-t-transparent rounded-full" />
                  </div>
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length + 1} className="py-20 text-center">
                  <UserCircle size={48} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-gray-400 text-sm">No contacts found</p>
                  <button onClick={onNewContact} className="mt-2 text-monday-blue text-sm hover:underline">
                    Add your first contact
                  </button>
                </td>
              </tr>
            ) : (
              contacts.map(contact => (
                <tr
                  key={contact.id}
                  onClick={() => onOpenContact(contact)}
                  className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer group"
                >
                  {activeCols.map(col => (
                    <td key={col.key} className="px-3 py-2.5 overflow-hidden">
                      {col.render(contact, fields)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right sticky right-0 bg-white group-hover:bg-blue-50/30 border-l border-gray-50">
                    <button
                      onClick={e => handleDelete(e, contact.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {contactsTotal === 0 ? 'No contacts' : `${contactsTotal.toLocaleString()} contact${contactsTotal !== 1 ? 's' : ''}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <button
              disabled={query.page <= 1}
              onClick={() => loadContacts({ page: query.page - 1 })}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span>Page {query.page} of {totalPages}</span>
            <button
              disabled={query.page >= totalPages}
              onClick={() => loadContacts({ page: query.page + 1 })}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
