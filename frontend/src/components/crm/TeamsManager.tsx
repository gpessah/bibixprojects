import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, UserPlus, X, Shield, Eye, User, Users, ChevronDown } from 'lucide-react';
import { useCRMStore, type CRMTeam, type CRMUser, type TeamRole } from '../../store/crmStore';
import Avatar from '../ui/Avatar';
import Modal from '../ui/Modal';
import toast from 'react-hot-toast';

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_META: Record<TeamRole, { label: string; color: string; icon: React.ReactNode }> = {
  leader:   { label: 'Team Leader', color: 'bg-purple-100 text-purple-700', icon: <Shield size={12} /> },
  operator: { label: 'Operator',    color: 'bg-blue-100 text-blue-700',     icon: <User size={12} /> },
  readonly: { label: 'Read Only',   color: 'bg-gray-100 text-gray-500',     icon: <Eye size={12} /> },
};

function RoleBadge({ role }: { role: TeamRole }) {
  const m = ROLE_META[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────

interface AddMemberProps {
  team: CRMTeam;
  allUsers: CRMUser[];
  onClose: () => void;
}

function AddMemberModal({ team, allUsers, onClose }: AddMemberProps) {
  const { addTeamMember } = useCRMStore();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<TeamRole>('operator');
  const [saving, setSaving] = useState(false);

  const existingIds = new Set(team.members.map(m => m.user_id));
  const available = allUsers.filter(u => !existingIds.has(u.id));

  const handleAdd = async () => {
    if (!userId) { toast.error('Select a user'); return; }
    setSaving(true);
    try {
      await addTeamMember(team.id, userId, role);
      toast.success('Member added');
      onClose();
    } catch {
      toast.error('Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Team Member" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">User</label>
          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
          >
            <option value="">— Select user —</option>
            {available.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          {available.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">All users are already in this team.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Role</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(ROLE_META) as [TeamRole, typeof ROLE_META[TeamRole]][]).map(([r, m]) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-medium transition-colors ${
                  role === r
                    ? 'border-monday-blue bg-blue-50 text-monday-blue'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p>🏆 <strong>Team Leader</strong>: sees all contacts assigned to this team</p>
          <p>👤 <strong>Operator</strong>: sees only contacts assigned to them</p>
          <p>👁️ <strong>Read Only</strong>: view-only access to own contacts</p>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleAdd}
            disabled={saving || !userId}
            className="px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add Member'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: CRMTeam;
  allUsers: CRMUser[];
  onEdit: () => void;
}

function TeamCard({ team, allUsers, onEdit }: TeamCardProps) {
  const { removeTeamMember, deleteTeam } = useCRMStore();
  const [expanded, setExpanded] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);

  const leaders = team.members.filter(m => m.role === 'leader');
  const operators = team.members.filter(m => m.role === 'operator');
  const readonly = team.members.filter(m => m.role === 'readonly');

  const handleDelete = async () => {
    if (!confirm(`Delete team "${team.name}"? This won't delete contacts.`)) return;
    try {
      await deleteTeam(team.id);
      toast.success('Team deleted');
    } catch {
      toast.error('Failed to delete team');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this team?`)) return;
    try {
      await removeTeamMember(team.id, userId);
      toast.success('Member removed');
    } catch {
      toast.error('Failed to remove');
    }
  };

  const MemberRow = ({ member }: { member: typeof team.members[0] }) => (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg group">
      <div className="flex items-center gap-2.5">
        <Avatar name={member.name} color={member.avatar_color} size="sm" />
        <div>
          <div className="text-sm font-medium text-gray-800">{member.name}</div>
          <div className="text-xs text-gray-400">{member.email}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <RoleBadge role={member.role} />
        <button
          onClick={() => handleRemoveMember(member.user_id, member.name)}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Team header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-monday-blue/10 flex items-center justify-center">
            <Users size={18} className="text-monday-blue" />
          </div>
          <div>
            <div className="font-semibold text-gray-800">{team.name}</div>
            {team.description && (
              <div className="text-xs text-gray-400">{team.description}</div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {team.members.length} member{team.members.length !== 1 ? 's' : ''}
            </span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        <div className="flex items-center gap-1 ml-4">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <Pencil size={14} />
          </button>
          <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Members list */}
      {expanded && (
        <div className="p-4">
          {team.members.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No members yet.</p>
          ) : (
            <div className="space-y-0.5">
              {leaders.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">Leaders</div>
                  {leaders.map(m => <MemberRow key={m.id} member={m} />)}
                </div>
              )}
              {operators.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">Operators</div>
                  {operators.map(m => <MemberRow key={m.id} member={m} />)}
                </div>
              )}
              {readonly.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">Read Only</div>
                  {readonly.map(m => <MemberRow key={m.id} member={m} />)}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowAddMember(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm text-monday-blue border border-dashed border-monday-blue/40 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <UserPlus size={14} /> Add Member
          </button>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          team={team}
          allUsers={allUsers}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  );
}

// ── Team Form Modal ───────────────────────────────────────────────────────────

interface TeamFormProps {
  team?: CRMTeam;
  onClose: () => void;
}

function TeamFormModal({ team, onClose }: TeamFormProps) {
  const { createTeam, updateTeam } = useCRMStore();
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Team name is required'); return; }
    setSaving(true);
    try {
      if (team) {
        await updateTeam(team.id, { name: name.trim(), description: description.trim() });
        toast.success('Team updated');
      } else {
        await createTeam({ name: name.trim(), description: description.trim() });
        toast.success('Team created');
      }
      onClose();
    } catch {
      toast.error('Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={team ? 'Edit Team' : 'Create Team'} onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Team Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Sales Team"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Description (optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief description"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-monday-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : team ? 'Update' : 'Create Team'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main TeamsManager ─────────────────────────────────────────────────────────

export default function TeamsManager() {
  const { teams, teamsLoading, loadTeams, crmUsers, loadCRMUsers } = useCRMStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState<CRMTeam | null>(null);

  useEffect(() => {
    loadTeams();
    loadCRMUsers();
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Teams</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Organize your users into teams with different access levels.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-monday-blue text-white text-sm rounded-lg hover:bg-blue-600"
        >
          <Plus size={16} /> Create Team
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <p className="font-semibold mb-1">How team access works:</p>
        <ul className="space-y-1 text-xs">
          <li>🏆 <strong>Team Leaders</strong> can see all contacts assigned to their team</li>
          <li>👤 <strong>Operators</strong> can only see contacts directly assigned to them</li>
          <li>👁️ <strong>Read Only</strong> members can view (but not edit) their assigned contacts</li>
          <li>👑 <strong>Admins</strong> always see everything, regardless of teams</li>
        </ul>
      </div>

      {/* Teams list */}
      {teamsLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-monday-blue border-t-transparent rounded-full" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <Users size={40} className="mx-auto mb-2 text-gray-200" />
          <p className="text-gray-400 text-sm">No teams yet</p>
          <button onClick={() => setShowCreate(true)} className="mt-2 text-monday-blue text-sm hover:underline">
            Create your first team
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              allUsers={crmUsers}
              onEdit={() => setEditTeam(team)}
            />
          ))}
        </div>
      )}

      {showCreate && <TeamFormModal onClose={() => setShowCreate(false)} />}
      {editTeam && <TeamFormModal team={editTeam} onClose={() => setEditTeam(null)} />}
    </div>
  );
}
