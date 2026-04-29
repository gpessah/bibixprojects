import { useState, useEffect, useRef } from 'react';
import {
  X, Pencil, Save, XCircle, MessageSquare, Activity, Info, Radio as Signal,
  TrendingUp, ChevronDown, UserCircle, Trash2, Clock, Send,
} from 'lucide-react';
import { useCRMStore, type CRMContact, type CRMField, type FieldGroup } from '../../store/crmStore';
import Avatar from '../ui/Avatar';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    created: '🆕',
    updated: '✏️',
    assigned: '👤',
    comment_added: '💬',
    status_changed: '🔄',
  };
  return icons[type] ?? '📋';
}

// ── Field value renderer (view mode) ─────────────────────────────────────────

function FieldValue({ field, value }: { field: CRMField; value: string }) {
  if (!value) return <span className="text-gray-400 text-sm">—</span>;

  const statusColors: Record<string, string> = {
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

  if (field.type === 'select') {
    const color = statusColors[value?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
    return <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>{value}</span>;
  }
  if (field.type === 'boolean') return <span className={`text-sm font-medium ${value === 'true' ? 'text-green-600' : 'text-gray-400'}`}>{value === 'true' ? '✓ Yes' : '✗ No'}</span>;
  if (field.type === 'email') return <a href={`mailto:${value}`} className="text-blue-600 hover:underline text-sm">{value}</a>;
  if (field.type === 'phone') return <a href={`tel:${value}`} className="text-blue-600 hover:underline text-sm">{value}</a>;
  if (field.type === 'url') return <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm break-all">{value}</a>;
  if (field.type === 'textarea') return <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>;
  return <span className="text-sm text-gray-700">{value}</span>;
}

// ── Field input (edit mode) ───────────────────────────────────────────────────

function FieldInput({ field, value, onChange }: { field: CRMField; value: string; onChange: (v: string) => void }) {
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 bg-white";

  if (field.type === 'select') return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
      <option value="">— Select —</option>
      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  if (field.type === 'textarea') return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className={`${cls} resize-none`} />
  );
  if (field.type === 'boolean') return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
      <option value="">— Select —</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
  if (field.type === 'date') return (
    <input type="date" value={value} onChange={e => onChange(e.target.value)} className={cls} />
  );
  if (field.type === 'number') return (
    <input type="number" value={value} onChange={e => onChange(e.target.value)} className={cls} />
  );
  return (
    <input
      type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cls}
    />
  );
}

// ── Fields Tab (view/edit) ────────────────────────────────────────────────────

interface FieldsTabProps {
  contact: CRMContact;
  fields: CRMField[];
  group: FieldGroup;
  editing: boolean;
  editValues: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function FieldsTab({ contact, fields, group, editing, editValues, onChange }: FieldsTabProps) {
  const groupFields = fields.filter(f => f.field_group === group);
  if (groupFields.length === 0) return (
    <div className="py-10 text-center text-gray-400 text-sm">No fields configured for this section.</div>
  );

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      {groupFields.map(field => {
        const val = editing ? (editValues[field.field_key] ?? '') : (contact.values[field.field_key] ?? '');
        return (
          <div
            key={field.id}
            className={field.type === 'textarea' || field.type === 'url' ? 'col-span-2' : ''}
          >
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              {field.name}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {editing ? (
              <FieldInput field={field} value={val} onChange={v => onChange(field.field_key, v)} />
            ) : (
              <FieldValue field={field} value={val} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Comments Tab ──────────────────────────────────────────────────────────────

interface CommentsTabProps { contactId: string }

function CommentsTab({ contactId }: CommentsTabProps) {
  const { comments, loadComments, createComment, deleteComment } = useCRMStore();
  const list = comments[contactId] ?? [];
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadComments(contactId);
  }, [contactId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [list.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await createComment(contactId, text.trim());
      setText('');
    } catch { toast.error('Failed to send'); }
    finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this comment?')) return;
    try { await deleteComment(contactId, id); } catch { toast.error('Failed'); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {list.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No comments yet. Be the first to add one.</div>
        ) : list.map(c => (
          <div key={c.id} className="flex gap-3 group">
            {c.author ? (
              <Avatar name={c.author.name} color={c.author.avatar_color} size="sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <UserCircle size={18} className="text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="bg-gray-50 rounded-xl px-4 py-3 relative">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-semibold text-sm text-gray-800">{c.author?.name ?? 'Unknown'}</span>
                  <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-100 pt-3 flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Write a comment… (Enter to send)"
          rows={2}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30 resize-none"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-3 py-2 bg-monday-blue text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 self-end"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

function ActivityTab({ contactId }: { contactId: string }) {
  const { activities, loadActivities } = useCRMStore();
  const list = activities[contactId] ?? [];

  useEffect(() => { loadActivities(contactId); }, [contactId]);

  return (
    <div className="space-y-2">
      {list.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No activity recorded yet.</div>
      ) : list.map(a => (
        <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
          <span className="text-lg leading-none mt-0.5 flex-shrink-0">{activityIcon(a.type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700">{a.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{a.author?.name ?? 'System'}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={11} /> {timeAgo(a.created_at)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Assign dropdown ───────────────────────────────────────────────────────────

interface AssignDropdownProps {
  contact: CRMContact;
  onAssigned: (contact: CRMContact) => void;
}

function AssignDropdown({ contact, onAssigned }: AssignDropdownProps) {
  const { crmUsers, loadCRMUsers, updateContact } = useCRMStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (crmUsers.length === 0) loadCRMUsers();
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assign = async (userId: string | null) => {
    setOpen(false);
    try {
      const updated = await updateContact(contact.id, { assigned_to: userId });
      onAssigned(updated);
      toast.success(userId ? 'Assigned' : 'Unassigned');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-full transition-colors"
      >
        {contact.assigned_user ? (
          <><Avatar name={contact.assigned_user.name} color={contact.assigned_user.avatar_color} size="xs" /> {contact.assigned_user.name}</>
        ) : (
          <><UserCircle size={14} className="text-gray-400" /> Assign</>
        )}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-48 py-1">
          <button
            onClick={() => assign(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
          >
            <UserCircle size={14} /> Unassign
          </button>
          <div className="border-t border-gray-100 my-1" />
          {crmUsers.map(u => (
            <button
              key={u.id}
              onClick={() => assign(u.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 ${contact.assigned_to === u.id ? 'font-semibold text-monday-blue' : 'text-gray-700'}`}
            >
              <Avatar name={u.name} color={u.avatar_color} size="xs" />
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

type Tab = 'general' | 'tracking' | 'sales' | 'comments' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'general',  label: 'General Info', icon: <Info size={14} /> },
  { id: 'tracking', label: 'Tracking',     icon: <Signal size={14} /> },
  { id: 'sales',    label: 'Sales',        icon: <TrendingUp size={14} /> },
  { id: 'comments', label: 'Comments',     icon: <MessageSquare size={14} /> },
  { id: 'activity', label: 'Activity',     icon: <Activity size={14} /> },
];

interface Props {
  contactId: string;
  onClose: () => void;
  onUpdated?: (contact: CRMContact) => void;
}

export default function ContactDetailModal({ contactId, onClose, onUpdated }: Props) {
  const { selectedContact, loadContact, fields, updateContact, loadContacts } = useCRMStore();
  const [tab, setTab] = useState<Tab>('general');
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<CRMContact | null>(null);

  useEffect(() => {
    loadContact(contactId).then(() => {});
  }, [contactId]);

  useEffect(() => {
    if (selectedContact?.id === contactId) {
      setContact(selectedContact);
    }
  }, [selectedContact, contactId]);

  const startEdit = () => {
    if (!contact) return;
    setEditValues({ ...contact.values });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValues({});
  };

  const handleSave = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const updated = await updateContact(contact.id, { values: editValues });
      setContact(updated);
      onUpdated?.(updated);
      setEditing(false);
      setEditValues({});
      toast.success('Changes saved');
      loadContacts();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAssigned = (updated: CRMContact) => {
    setContact(updated);
    onUpdated?.(updated);
    loadContacts();
  };

  const contactName = contact
    ? [contact.values['first_name'], contact.values['last_name']].filter(Boolean).join(' ') ||
      contact.values['name'] || 'Contact'
    : 'Loading…';

  const statusVal = contact?.values['contact_status'] ?? '';
  const kycVal = contact?.values['kyc_status'] ?? '';

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-monday-blue to-blue-400 flex items-center justify-center text-white font-semibold flex-shrink-0">
                {contactName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{contactName}</h2>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {contact?.id && (
                    <span className="text-xs font-mono text-gray-400">
                      ID: {contact.contact_num ? `#${contact.contact_num}` : contact.id.slice(0, 8)}
                    </span>
                  )}
                  {statusVal && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      statusVal.toLowerCase() === 'active' ? 'bg-green-100 text-green-700' :
                      statusVal.toLowerCase() === 'registered' ? 'bg-blue-100 text-blue-700' :
                      statusVal.toLowerCase() === 'banned' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{statusVal}</span>
                  )}
                  {kycVal && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      kycVal === 'Approved' ? 'bg-green-100 text-green-700' :
                      kycVal === 'No KYC' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{kycVal}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!editing ? (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Pencil size={13} /> Edit
                </button>
              ) : (
                <>
                  <button onClick={cancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <XCircle size={13} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-60"
                  >
                    <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Assign */}
          {contact && (
            <div className="mt-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Assigned to:</span>
                <AssignDropdown contact={contact} onAssigned={handleAssigned} />
              </div>
              {contact.created_at && (
                <span className="text-xs text-gray-400">
                  Added {new Date(contact.created_at).toLocaleDateString()}
                </span>
              )}
              <span className="text-xs text-gray-400 capitalize">
                Source: {contact.source?.startsWith('form:') ? 'Form' : contact.source || 'Manual'}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-4 flex-shrink-0 bg-white">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-monday-blue text-monday-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!contact ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin w-6 h-6 border-2 border-monday-blue border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {(tab === 'general' || tab === 'tracking' || tab === 'sales') && (
                <FieldsTab
                  contact={contact}
                  fields={fields}
                  group={tab}
                  editing={editing}
                  editValues={editValues}
                  onChange={(key, val) => setEditValues(prev => ({ ...prev, [key]: val }))}
                />
              )}
              {tab === 'comments' && <CommentsTab contactId={contactId} />}
              {tab === 'activity' && <ActivityTab contactId={contactId} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
