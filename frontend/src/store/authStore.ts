import { create } from 'zustand';
import api from '../api/client';
import type { User, AppModule } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  /** Returns true if the current user can access the given module.
   *  Admins always have full access. Non-admins use their permissions map;
   *  if a module key is absent the default is true (backward-compatible). */
  hasPermission: (module: AppModule) => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    set({ user: data.user });
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', data.token);
    set({ user: data.user });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, loading: false });
    }
  },

  updateUser: async (updates) => {
    const { data } = await api.put('/auth/me', updates);
    set({ user: data });
  },

  hasPermission: (module: AppModule): boolean => {
    const state = useAuthStore.getState() as { user: User | null };
    const user: User | null = state.user;
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perms: Partial<Record<AppModule, boolean>> = user.permissions ?? {};
    // If the key is absent → default allow (backward compatible)
    return perms[module] !== false;
  },
}));
