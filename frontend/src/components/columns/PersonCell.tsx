import { useState, useEffect, useRef } from 'react';
import { UserPlus } from 'lucide-react';
import Avatar from '../ui/Avatar';
import api from '../../api/client';
import type { User } from '../../types';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  workspaceId?: string;
}

// ── Module-level cache so every PersonCell on the page shares one fetch ────────
let _cache: User[] | null = null;
let _promise: Promise<User[]> | null = null;

async function fetchUsers(workspaceId?: string): Promise<User[]> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = (workspaceId
      ? api.get(`/workspaces/${workspaceId}/members`)
      : api.get('/auth/users')
    ).then(r => { _cache = r.data; return _cache!; });
  }
  return _promise;
}

export default function PersonCell({ value, onChange, workspaceId }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const assigned = users.find(u => u.id === value);

  // Load users on mount so assigned avatars show without clicking
  useEffect(() => {
    fetchUsers(workspaceId).then(setUsers).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleOpen = async () => {
    if (users.length === 0) {
      const list = await fetchUsers(workspaceId);
      setUsers(list);
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} className="relative w-full h-full">
      <button onClick={handleOpen} className="w-full h-full flex items-center justify-center hover:bg-gray-50">
        {assigned
          ? <Avatar name={assigned.name} color={assigned.avatar_color} size="xs" />
          : <UserPlus size={14} className="text-gray-300" />}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] mt-0.5">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
            Assign to
          </div>
          {users.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No members found</div>
          )}
          {users.map(u => (
            <button key={u.id} onClick={() => { onChange(u.id); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 ${value === u.id ? 'bg-blue-50' : ''}`}>
              <Avatar name={u.name} color={u.avatar_color} size="xs" />
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium text-gray-800 truncate">{u.name}</div>
                <div className="text-xs text-gray-400 truncate">{u.email}</div>
              </div>
              {value === u.id && <span className="text-monday-blue text-xs">✓</span>}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => { onChange(null); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-gray-400">
              Clear assignment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
