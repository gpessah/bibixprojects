import { create } from 'zustand';
import api from '../api/client';
import type { Workspace, Board } from '../types';

interface WorkspaceState {
  workspaces: Workspace[];
  boards: Record<string, Board[]>;
  loading: boolean;
  loadWorkspaces: () => Promise<void>;
  loadBoards: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: { name?: string; description?: string }) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  createBoard: (workspaceId: string, name: string, icon?: string) => Promise<Board>;
  deleteBoard: (boardId: string, workspaceId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  boards: {},
  loading: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    const { data } = await api.get('/workspaces');
    set({ workspaces: data, loading: false });
    for (const ws of data) get().loadBoards(ws.id);
  },

  loadBoards: async (workspaceId) => {
    const { data } = await api.get(`/boards/workspace/${workspaceId}`);
    set(state => ({ boards: { ...state.boards, [workspaceId]: data } }));
  },

  createWorkspace: async (name, description) => {
    const { data } = await api.post('/workspaces', { name, description });
    set(state => ({ workspaces: [...state.workspaces, data] }));
    return data;
  },

  updateWorkspace: async (id, updates) => {
    const { data } = await api.put(`/workspaces/${id}`, updates);
    set(state => ({ workspaces: state.workspaces.map(w => w.id === id ? { ...w, ...data } : w) }));
  },

  deleteWorkspace: async (id) => {
    await api.delete(`/workspaces/${id}`);
    set(state => {
      const boards = { ...state.boards };
      delete boards[id];
      return { workspaces: state.workspaces.filter(w => w.id !== id), boards };
    });
  },

  createBoard: async (workspaceId, name, icon) => {
    const { data } = await api.post('/boards', { workspace_id: workspaceId, name, icon });
    set(state => ({
      boards: { ...state.boards, [workspaceId]: [...(state.boards[workspaceId] || []), data] }
    }));
    return data;
  },

  deleteBoard: async (boardId, workspaceId) => {
    await api.delete(`/boards/${boardId}`);
    set(state => ({
      boards: { ...state.boards, [workspaceId]: (state.boards[workspaceId] || []).filter(b => b.id !== boardId) }
    }));
  },
}));
