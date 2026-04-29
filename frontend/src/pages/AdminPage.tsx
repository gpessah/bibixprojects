import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Shield, User, Eye, Settings2, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import type { User as UserType, UserRole, AppModule } from '../types';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, { label: string; color: string; icon: React.ReactNode }> = {
  admin:    { label: 'Admin',     color: 'bg-purple-100 text-purple-700', icon: <Shield size={12} /> },
  user:     { label: 'User',      color: 'bg-blue-100 text-blue-700',     icon: <User size={12} /> },
  readonly: { label: 'Read Only', color: 'bg-gray-100 text-gray-600',     icon: <Eye size={12} /> },
};

const MODULES: { id: AppModule; label: string; description: string; emoji: string }[] = [
  { id: 'boards',     label: 'Boards & Workspaces', description: 'View and manage project boards', emoji: '📋' },
  { id: 'calendar',   label: 'Calendar',             description: 'Access the calendar view',       emoji: '📅' },
  { id: 'bibixbot',   label: 'BibixBot',             description: 'Use the AI assistant',           emoji: '🤖' },
  { id: 'scheduling', label: 'Scheduling',           description: 'Manage bookings and schedules',  emoji: '🗓️' },
  { id: 'crm',        label: 'CRM',                  description: 'Contacts, forms and reports',    emoji: '👥' },
];

const AVATAR_COLORS = ['#0073ea','#e2445c','#00c875','#ffcb00','#a25ddc','#037f4c','#bb3354','#ff642e'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminUser extends UserType {
  role: UserRole;
  permissions: Partial<Record<AppModule, boolean>>;
  created_at: string;
}

interface FormState {
  name: string; email: string; password: string; role: UserRole; avatar_color: string;
}
const emptyForm = (): FormState => ({ name: '', email: '', password: '', role: 'user', avatar_color: '#0073ea' });

// ── Permissions panel ─────────────────────────────────────────────────────────

function PermissionsPanel({ user, onClose, onSaved }: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}) {
  const [perms, setPerms] = useState<Partial<Record<AppModule, boolean>>>(user.permissions ?? {});
  const [saving, setSaving] = useState(false);

  // For admins permissions are irrelevant (always full access), but we still allow editing
  const isAdmin = user.role === 'admin';

  const toggle = (mod: AppModule) => {
    setPerms(p => {
      // If key absent → currently defaults to true; toggling means set to false
      const current = p[mod] !== false;
      return { ...p, [mod]: !current };
    });
  };

  const getValue = (mod: AppModule) => perms[mod] !== false; // absent = allowed

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/admin/users/${user.id}/permissions`, { permissions: perms });
      onSaved(data);
      toast.success('Permissions updated');
      onClose();
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <Avatar name={user.name} color={user.avatar_color} size="sm" />
            <div>
              <div className="font-semibold text-gray-800 text-sm">{user.name}</div>
              <div className="text-xs text-gray-400">{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_META[user.role]?.color}`}>
              {ROLE_META[user.role]?.icon} {ROLE_META[user.role]?.label}
            </span>
            {isAdmin && (
              <span className="text-xs text-purple-500 font-medium">Admins always have full access</span>
            )}
          </div>
        </div>

        {/* Module toggles */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Module Access</p>

          <div className="space-y-2">
            {MODULES.map(mod => {
              const on = getValue(mod.id);
              return (
                <div key={mod.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                    isAdmin
                      ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      : on
                        ? 'border-blue-200 bg-blue-50/50 cursor-pointer hover:bg-blue-50'
                        : 'border-gray-200 bg-white cursor-pointer hover:bg-gray-50'
                  }`}
                  onClick={() => !isAdmin && toggle(mod.id)}
                >
                  <span className="text-xl flex-shrink-0">{mod.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{mod.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{mod.description}</div>
                  </div>
                  <div className="flex-shrink-0">
                    {isAdmin
                      ? <ToggleRight size={22} className="text-blue-400" />
                      : on
                        ? <ToggleRight size={22} className="text-blue-500" />
                        : <ToggleLeft  size={22} className="text-gray-300" />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200">
            Cancel
          </button>
          {!isAdmin && (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { checkAndLoad(); }, []);

  const checkAndLoad = async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
      setIsAdmin(true);
    } catch {
      setIsAdmin(false);
    } finally { setLoading(false); }
  };

  const promoteToAdmin = async () => {
    try {
      await api.post('/admin/promote-self');
      toast.success('You are now an admin! Reloading…');
      window.location.reload();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed');
    }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit   = (u: AdminUser) => { setEditing(u); setForm({ name: u.name, email: u.email, password: '', role: u.role, avatar_color: u.avatar_color }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error('Name and email required');
    if (!editing && !form.password) return toast.error('Password required');
    setSaving(true);
    try {
      if (editing) {
        const payload: Partial<FormState> = { name: form.name, email: form.email, role: form.role, avatar_color: form.avatar_color };
        if (form.password) payload.password = form.password;
        const { data } = await api.put(`/admin/users/${editing.id}`, payload);
        setUsers(u => u.map(x => x.id === editing.id ? { ...x, ...data } : x));
        toast.success('User updated');
      } else {
        const { data } = await api.post('/admin/users', form);
        setUsers(u => [...u, { ...data, permissions: {} }]);
        toast.success('User created');
      }
      setShowModal(false);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/admin/users/${id}`);
    setUsers(u => u.filter(x => x.id !== id));
    toast.success('User deleted');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-monday-blue border-t-transparent rounded-full" />
    </div>
  );

  if (!isAdmin) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
      <Shield size={48} className="text-gray-300" />
      <h2 className="text-xl font-bold text-gray-800">Admin Access Required</h2>
      <p className="text-sm text-gray-500 max-w-sm">You don't have admin privileges. If you're the first user, you can promote yourself.</p>
      <button onClick={promoteToAdmin} className="flex items-center gap-2 px-5 py-2.5 bg-monday-blue text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
        <Shield size={16} /> Become Admin
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500 mt-1">{users.length} user{users.length !== 1 ? 's' : ''} registered</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-monday-blue text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
            <Plus size={16} /> New User
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Access</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const roleMeta = ROLE_META[u.role] || ROLE_META.user;
                const isAdmin_ = u.role === 'admin';
                const allowedCount = isAdmin_
                  ? MODULES.length
                  : MODULES.filter(m => (u.permissions ?? {})[m.id] !== false).length;

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} color={u.avatar_color} size="sm" />
                        <div className="font-medium text-sm text-gray-900">
                          {u.name}
                          {u.id === me?.id && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleMeta.color}`}>
                        {roleMeta.icon} {roleMeta.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setPermUser(u)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 group"
                      >
                        <div className="flex gap-1">
                          {MODULES.map(m => {
                            const on = isAdmin_ || (u.permissions ?? {})[m.id] !== false;
                            return (
                              <span key={m.id} title={m.label}
                                className={`w-5 h-5 rounded flex items-center justify-center text-[11px] ${on ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-300'}`}>
                                {m.emoji}
                              </span>
                            );
                          })}
                        </div>
                        <ChevronRight size={13} className="text-gray-300 group-hover:text-blue-500" />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setPermUser(u)} title="Manage permissions"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Settings2 size={15} />
                        </button>
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 text-gray-400 hover:text-monday-blue hover:bg-blue-50 rounded">
                          <Pencil size={15} />
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => handleDelete(u.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create user modal */}
      {showModal && (
        <Modal title={editing ? 'Edit User' : 'New User'} onClose={() => setShowModal(false)} size="sm">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Avatar Color</label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, avatar_color: c }))}
                    className={`w-7 h-7 rounded-full hover:scale-110 transition-transform ${form.avatar_color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            {(['name', 'email'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{field}</label>
                <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  type={field === 'email' ? 'email' : 'text'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Password {editing && <span className="text-gray-400">(leave blank to keep current)</span>}
              </label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editing ? '••••••' : 'At least 6 characters'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(ROLE_META) as [UserRole, typeof ROLE_META[UserRole]][]).map(([role, meta]) => (
                  <button key={role} onClick={() => setForm(f => ({ ...f, role }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${form.role === role ? 'border-monday-blue bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className={`p-1.5 rounded-full ${meta.color}`}>{meta.icon}</span>
                    <span className="text-xs font-medium text-gray-700">{meta.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Update' : 'Create User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permissions side panel */}
      {permUser && (
        <PermissionsPanel
          user={permUser}
          onClose={() => setPermUser(null)}
          onSaved={updated => setUsers(u => u.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
        />
      )}
    </div>
  );
}
