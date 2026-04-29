import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Eye, User } from 'lucide-react';
import api from '../../api/client';
import type { User as UserType } from '../../types';
import Avatar from '../ui/Avatar';
import Modal from '../ui/Modal';
import toast from 'react-hot-toast';

interface Member {
  id: string; name: string; email: string; avatar_color: string;
  role: string; access: 'edit' | 'readonly'; joined_at: string;
}

interface Props { boardId: string; boardName: string; onClose: () => void; }

const ACCESS_OPTIONS = [
  { value: 'edit', label: 'Can Edit', icon: <User size={13} /> },
  { value: 'readonly', label: 'Read Only', icon: <Eye size={13} /> },
];

export default function BoardMembersModal({ boardId, boardName, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [available, setAvailable] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAccess, setSelectedAccess] = useState<'edit' | 'readonly'>('edit');

  useEffect(() => { load(); }, [boardId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/boards/${boardId}/members`);
      setMembers(data);
      setCanManage(true);
      const av = await api.get(`/boards/${boardId}/members/available-users`);
      setAvailable(av.data);
    } catch {
      setCanManage(false);
    } finally { setLoading(false); }
  };

  const addMember = async () => {
    if (!selectedUser) return;
    try {
      await api.post(`/boards/${boardId}/members`, { user_id: selectedUser, access: selectedAccess });
      toast.success('Member added');
      setShowAdd(false); setSelectedUser('');
      load();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed');
    }
  };

  const updateAccess = async (userId: string, access: 'edit' | 'readonly') => {
    await api.put(`/boards/${boardId}/members/${userId}`, { access });
    setMembers(m => m.map(x => x.id === userId ? { ...x, access } : x));
    toast.success('Access updated');
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    await api.delete(`/boards/${boardId}/members/${userId}`);
    const removed = members.find(x => x.id === userId);
    setMembers(m => m.filter(x => x.id !== userId));
    if (removed) setAvailable(a => [...a, { id: removed.id, name: removed.name, email: removed.email, avatar_color: removed.avatar_color, role: 'user' }]);
    toast.success('Member removed');
  };

  return (
    <Modal title={`Share — ${boardName}`} onClose={onClose} size="md">
      <div className="p-6">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : (
          <>
            {members.length === 0 && (
              <p className="text-sm text-gray-400 mb-6">No board-level members yet. Workspace members already have access.</p>
            )}
            <div className="space-y-3 mb-6">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.name} color={m.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage ? (
                      <select value={m.access} onChange={e => updateAccess(m.id, e.target.value as 'edit' | 'readonly')}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-monday-blue">
                        <option value="edit">Can Edit</option>
                        <option value="readonly">Read Only</option>
                      </select>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${m.access === 'readonly' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                        {m.access === 'readonly' ? 'Read Only' : 'Can Edit'}
                      </span>
                    )}
                    {canManage && m.role !== 'owner' && (
                      <button onClick={() => removeMember(m.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canManage && (
              <>
                {!showAdd ? (
                  <button onClick={() => setShowAdd(true)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-monday-blue hover:text-monday-blue transition-colors">
                    <UserPlus size={16} /> Share with a user
                  </button>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Select User</label>
                      <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue">
                        <option value="">— choose a user —</option>
                        {available.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Access Level</label>
                      <div className="flex gap-2">
                        {ACCESS_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => setSelectedAccess(opt.value as 'edit' | 'readonly')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm transition-colors ${selectedAccess === opt.value ? 'border-monday-blue bg-blue-50 text-monday-blue' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
                      <button onClick={addMember} disabled={!selectedUser}
                        className="flex-1 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Share</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
