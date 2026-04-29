import { create } from 'zustand';
import api from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'url' | 'boolean' | 'textarea';
export type FieldGroup = 'general' | 'tracking' | 'sales';
export type TeamRole = 'leader' | 'operator' | 'readonly';

export interface CRMField {
  id: string;
  name: string;
  field_key: string;
  type: FieldType;
  options: string[];
  required: boolean;
  position: number;
  field_group: FieldGroup;
  list_visible: boolean;
  created_at: string;
}

export interface CRMUser {
  id: string;
  name: string;
  email: string;
  avatar_color: string;
}

export interface CRMContact {
  id: string;
  contact_num: number | null;
  source: string;
  created_by: string | null;
  assigned_to: string | null;
  assigned_user: CRMUser | null;
  team_id: string | null;
  values: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface HiddenField {
  field_key: string;
  url_param: string;
}

export interface CRMForm {
  id: string;
  name: string;
  description: string;
  fields: string[];
  settings: {
    redirect_url?: string;
    success_message?: string;
    button_text?: string;
    hidden_fields?: HiddenField[];
  };
  active: boolean;
  created_at: string;
}

export interface CRMApiKey {
  id: string;
  name: string;
  api_key_masked: string;
  api_key_full: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  active: boolean;
}

export interface CRMTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  name: string;
  email: string;
  avatar_color: string;
}

export interface CRMTeam {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  members: CRMTeamMember[];
}

export interface CRMComment {
  id: string;
  contact_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: CRMUser | null;
}

export interface CRMActivity {
  id: string;
  contact_id: string;
  user_id: string;
  type: string;
  description: string | null;
  created_at: string;
  author: CRMUser | null;
}

export interface ReportData {
  total: number;
  byValue: { label: string; count: number }[];
  bySource: { label: string; count: number }[];
  overTime: { date: string; count: number }[];
}

export interface ContactQuery {
  search: string;
  filters: Record<string, string>;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface CRMState {
  // Fields
  fields: CRMField[];
  fieldsLoading: boolean;
  loadFields: () => Promise<void>;
  createField: (data: { name: string; type?: FieldType; options?: string[]; required?: boolean; field_group?: FieldGroup }) => Promise<void>;
  updateField: (id: string, data: Partial<Pick<CRMField, 'name' | 'options' | 'required' | 'position' | 'field_group' | 'list_visible'>>) => Promise<void>;
  deleteField: (id: string) => Promise<void>;

  // Contacts (list)
  contacts: CRMContact[];
  contactsTotal: number;
  contactsLoading: boolean;
  query: ContactQuery;
  loadContacts: (q?: Partial<ContactQuery>) => Promise<void>;
  createContact: (data: { values: Record<string, string>; assigned_to?: string; team_id?: string }) => Promise<CRMContact>;
  updateContact: (id: string, data: { values?: Record<string, string>; assigned_to?: string | null; team_id?: string | null }) => Promise<CRMContact>;
  deleteContact: (id: string) => Promise<void>;

  // Single contact detail
  selectedContact: CRMContact | null;
  loadContact: (id: string) => Promise<void>;
  clearSelectedContact: () => void;

  // Comments (keyed by contact id)
  comments: Record<string, CRMComment[]>;
  loadComments: (contactId: string) => Promise<void>;
  createComment: (contactId: string, content: string) => Promise<void>;
  deleteComment: (contactId: string, commentId: string) => Promise<void>;

  // Activities (keyed by contact id)
  activities: Record<string, CRMActivity[]>;
  loadActivities: (contactId: string) => Promise<void>;

  // Teams
  teams: CRMTeam[];
  teamsLoading: boolean;
  loadTeams: () => Promise<void>;
  createTeam: (data: { name: string; description?: string }) => Promise<CRMTeam>;
  updateTeam: (id: string, data: { name?: string; description?: string }) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  addTeamMember: (teamId: string, userId: string, role: TeamRole) => Promise<void>;
  removeTeamMember: (teamId: string, userId: string) => Promise<void>;

  // Users for CRM assignment
  crmUsers: CRMUser[];
  loadCRMUsers: () => Promise<void>;

  // Forms
  forms: CRMForm[];
  formsLoading: boolean;
  loadForms: () => Promise<void>;
  createForm: (data: { name: string; description?: string; fields?: string[]; settings?: CRMForm['settings'] }) => Promise<CRMForm>;
  updateForm: (id: string, data: Partial<Pick<CRMForm, 'name' | 'description' | 'fields' | 'settings' | 'active'>>) => Promise<void>;
  deleteForm: (id: string) => Promise<void>;

  // Reports
  report: ReportData | null;
  reportLoading: boolean;
  loadReport: (params?: { groupBy?: string; from?: string; to?: string }) => Promise<void>;

  // API Keys
  apiKeys: CRMApiKey[];
  apiKeysLoading: boolean;
  loadApiKeys: () => Promise<void>;
  createApiKey: (name: string) => Promise<CRMApiKey>;
  deleteApiKey: (id: string) => Promise<void>;
  toggleApiKey: (id: string, active: boolean) => Promise<void>;
}

export const useCRMStore = create<CRMState>((set, get) => ({
  // ── Fields ─────────────────────────────────────────────────────────────────
  fields: [],
  fieldsLoading: false,

  loadFields: async () => {
    set({ fieldsLoading: true });
    try {
      const { data } = await api.get<CRMField[]>('/crm/fields');
      set({ fields: data });
    } finally {
      set({ fieldsLoading: false });
    }
  },

  createField: async (payload) => {
    const { data } = await api.post<CRMField>('/crm/fields', payload);
    set(s => ({ fields: [...s.fields, data] }));
  },

  updateField: async (id, payload) => {
    const { data } = await api.put<CRMField>(`/crm/fields/${id}`, payload);
    set(s => ({ fields: s.fields.map(f => f.id === id ? data : f) }));
  },

  deleteField: async (id) => {
    await api.delete(`/crm/fields/${id}`);
    set(s => ({ fields: s.fields.filter(f => f.id !== id) }));
  },

  // ── Contacts ───────────────────────────────────────────────────────────────
  contacts: [],
  contactsTotal: 0,
  contactsLoading: false,
  query: { search: '', filters: {}, sort: 'created_at', dir: 'desc', page: 1 },

  loadContacts: async (q = {}) => {
    const next = { ...get().query, ...q };
    set({ query: next, contactsLoading: true });
    try {
      const params: Record<string, string> = {
        search: next.search,
        sort: next.sort,
        dir: next.dir,
        page: String(next.page),
      };
      for (const [k, v] of Object.entries(next.filters)) {
        if (v) params[`filter[${k}]`] = v;
      }
      const { data } = await api.get('/crm/contacts', { params });
      set({ contacts: data.contacts, contactsTotal: data.total });
    } finally {
      set({ contactsLoading: false });
    }
  },

  createContact: async (payload) => {
    const { data } = await api.post<CRMContact>('/crm/contacts', payload);
    set(s => ({ contacts: [data, ...s.contacts], contactsTotal: s.contactsTotal + 1 }));
    return data;
  },

  updateContact: async (id, payload) => {
    const { data } = await api.put<CRMContact>(`/crm/contacts/${id}`, payload);
    set(s => ({
      contacts: s.contacts.map(c => c.id === id ? data : c),
      selectedContact: s.selectedContact?.id === id ? data : s.selectedContact,
    }));
    return data;
  },

  deleteContact: async (id) => {
    await api.delete(`/crm/contacts/${id}`);
    set(s => ({ contacts: s.contacts.filter(c => c.id !== id), contactsTotal: s.contactsTotal - 1 }));
  },

  // ── Selected contact detail ────────────────────────────────────────────────
  selectedContact: null,

  loadContact: async (id) => {
    const { data } = await api.get<CRMContact>(`/crm/contacts/${id}`);
    set({ selectedContact: data });
  },

  clearSelectedContact: () => set({ selectedContact: null }),

  // ── Comments ───────────────────────────────────────────────────────────────
  comments: {},

  loadComments: async (contactId) => {
    const { data } = await api.get<CRMComment[]>(`/crm/contacts/${contactId}/comments`);
    set(s => ({ comments: { ...s.comments, [contactId]: data } }));
  },

  createComment: async (contactId, content) => {
    const { data } = await api.post<CRMComment>(`/crm/contacts/${contactId}/comments`, { content });
    set(s => ({
      comments: { ...s.comments, [contactId]: [...(s.comments[contactId] || []), data] },
    }));
  },

  deleteComment: async (contactId, commentId) => {
    await api.delete(`/crm/contacts/${contactId}/comments/${commentId}`);
    set(s => ({
      comments: {
        ...s.comments,
        [contactId]: (s.comments[contactId] || []).filter(c => c.id !== commentId),
      },
    }));
  },

  // ── Activities ─────────────────────────────────────────────────────────────
  activities: {},

  loadActivities: async (contactId) => {
    const { data } = await api.get<CRMActivity[]>(`/crm/contacts/${contactId}/activities`);
    set(s => ({ activities: { ...s.activities, [contactId]: data } }));
  },

  // ── Teams ──────────────────────────────────────────────────────────────────
  teams: [],
  teamsLoading: false,

  loadTeams: async () => {
    set({ teamsLoading: true });
    try {
      const { data } = await api.get<CRMTeam[]>('/crm/teams');
      set({ teams: data });
    } finally {
      set({ teamsLoading: false });
    }
  },

  createTeam: async (payload) => {
    const { data } = await api.post<CRMTeam>('/crm/teams', payload);
    set(s => ({ teams: [data, ...s.teams] }));
    return data;
  },

  updateTeam: async (id, payload) => {
    const { data } = await api.put<CRMTeam>(`/crm/teams/${id}`, payload);
    set(s => ({ teams: s.teams.map(t => t.id === id ? data : t) }));
  },

  deleteTeam: async (id) => {
    await api.delete(`/crm/teams/${id}`);
    set(s => ({ teams: s.teams.filter(t => t.id !== id) }));
  },

  addTeamMember: async (teamId, userId, role) => {
    const { data } = await api.post<CRMTeam>(`/crm/teams/${teamId}/members`, { user_id: userId, role });
    set(s => ({ teams: s.teams.map(t => t.id === teamId ? data : t) }));
  },

  removeTeamMember: async (teamId, userId) => {
    const { data } = await api.delete<CRMTeam>(`/crm/teams/${teamId}/members/${userId}`);
    set(s => ({ teams: s.teams.map(t => t.id === teamId ? data : t) }));
  },

  // ── CRM Users ──────────────────────────────────────────────────────────────
  crmUsers: [],

  loadCRMUsers: async () => {
    const { data } = await api.get<CRMUser[]>('/crm/users');
    set({ crmUsers: data });
  },

  // ── Forms ──────────────────────────────────────────────────────────────────
  forms: [],
  formsLoading: false,

  loadForms: async () => {
    set({ formsLoading: true });
    try {
      const { data } = await api.get<CRMForm[]>('/crm/forms');
      set({ forms: data });
    } finally {
      set({ formsLoading: false });
    }
  },

  createForm: async (payload) => {
    const { data } = await api.post<CRMForm>('/crm/forms', payload);
    set(s => ({ forms: [data, ...s.forms] }));
    return data;
  },

  updateForm: async (id, payload) => {
    const { data } = await api.put<CRMForm>(`/crm/forms/${id}`, payload);
    set(s => ({ forms: s.forms.map(f => f.id === id ? data : f) }));
  },

  deleteForm: async (id) => {
    await api.delete(`/crm/forms/${id}`);
    set(s => ({ forms: s.forms.filter(f => f.id !== id) }));
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  report: null,
  reportLoading: false,

  loadReport: async (params = {}) => {
    set({ reportLoading: true });
    try {
      const { data } = await api.get<ReportData>('/crm/reports', { params });
      set({ report: data });
    } finally {
      set({ reportLoading: false });
    }
  },

  // ── API Keys ───────────────────────────────────────────────────────────────
  apiKeys: [],
  apiKeysLoading: false,

  loadApiKeys: async () => {
    set({ apiKeysLoading: true });
    try {
      const { data } = await api.get<CRMApiKey[]>('/crm/api-keys');
      set({ apiKeys: data });
    } finally {
      set({ apiKeysLoading: false });
    }
  },

  createApiKey: async (name) => {
    const { data } = await api.post<CRMApiKey>('/crm/api-keys', { name });
    set(s => ({ apiKeys: [data, ...s.apiKeys] }));
    return data;
  },

  deleteApiKey: async (id) => {
    await api.delete(`/crm/api-keys/${id}`);
    set(s => ({ apiKeys: s.apiKeys.filter(k => k.id !== id) }));
  },

  toggleApiKey: async (id, active) => {
    const { data } = await api.patch<CRMApiKey>(`/crm/api-keys/${id}`, { active });
    set(s => ({ apiKeys: s.apiKeys.map(k => k.id === id ? data : k) }));
  },
}));
