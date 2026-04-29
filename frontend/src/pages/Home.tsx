import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../store/authStore';
import { format, parseISO } from 'date-fns';
import Avatar from '../components/ui/Avatar';

export default function Home() {
  const { workspaces, boards } = useWorkspaceStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const allBoards = Object.values(boards).flat();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-10">
          {user && <Avatar name={user.name} color={user.avatar_color} size="lg" />}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-gray-500 mt-1">Here's what's happening across your boards</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-blue">{workspaces.length}</div>
            <div className="text-sm text-gray-500 mt-1">Workspaces</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-green">{allBoards.length}</div>
            <div className="text-sm text-gray-500 mt-1">Boards</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-2xl font-bold text-monday-orange">{workspaces.filter(w => w.role === 'owner').length}</div>
            <div className="text-sm text-gray-500 mt-1">Owned workspaces</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Boards</h2>
        {allBoards.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 text-sm">No boards yet — create one from the sidebar!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {allBoards.map(board => {
              const ws = workspaces.find(w => w.id === board.workspace_id);
              return (
                <button key={board.id} onClick={() => navigate(`/board/${board.id}`)}
                  className="bg-white rounded-xl p-5 border border-gray-200 hover:border-monday-blue hover:shadow-md transition-all text-left group">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{board.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 group-hover:text-monday-blue truncate">{board.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{ws?.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{format(parseISO(board.created_at), 'MMM d, yyyy')}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
