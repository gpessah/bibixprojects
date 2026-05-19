// Background service worker — central place to talk to the Monday backend.
// Content scripts and the popup message this worker, which handles auth + the actual fetches.

const DEFAULT_API_BASE = 'http://localhost:3001';

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  return apiBase || DEFAULT_API_BASE;
}

async function getToken() {
  const { token } = await chrome.storage.local.get('token');
  return token || null;
}

async function apiFetch(path, opts = {}) {
  const base = await getApiBase();
  const token = await getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401) await chrome.storage.local.remove(['token', 'user']);
    return { ok: false, status: res.status, error: data.error || res.statusText, data };
  }
  return { ok: true, status: res.status, data };
}

const handlers = {
  async login({ email, password, apiBase }) {
    if (apiBase) await chrome.storage.local.set({ apiBase });
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (res.ok && res.data.token) {
      await chrome.storage.local.set({ token: res.data.token, user: res.data.user });
    }
    return res;
  },
  async logout() {
    await chrome.storage.local.remove(['token', 'user']);
    return { ok: true };
  },
  async me() {
    const { user, token } = await chrome.storage.local.get(['user', 'token']);
    return { ok: true, data: { user: user || null, hasToken: !!token } };
  },
  async getSettings() {
    return apiFetch('/api/linkedin/settings');
  },
  async saveSettings(patch) {
    return apiFetch('/api/linkedin/settings', { method: 'PUT', body: patch });
  },
  async generateComment(body) {
    return apiFetch('/api/linkedin/generate-comment', { method: 'POST', body });
  },
  async generateReply(body) {
    return apiFetch('/api/linkedin/generate-reply', { method: 'POST', body });
  },
  async generateContribution(body) {
    return apiFetch('/api/linkedin/generate-contribution', { method: 'POST', body });
  },
  async getHistory({ limit = 20 } = {}) {
    return apiFetch(`/api/linkedin/history?limit=${limit}`);
  },
  async findEmail(body) {
    return apiFetch('/api/contacts/find-email', { method: 'POST', body });
  },
  async listContacts() {
    return apiFetch('/api/contacts');
  },
  async contactToCrm({ contactId }) {
    return apiFetch(`/api/contacts/${contactId}/to-crm`, { method: 'POST' });
  },
  async deleteContact({ contactId }) {
    return apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
  },
  async setApiBase({ apiBase }) {
    await chrome.storage.local.set({ apiBase });
    return { ok: true };
  },
  async getApiBase() {
    return { ok: true, data: { apiBase: await getApiBase() } };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg && msg.type];
  if (!fn) { sendResponse({ ok: false, error: 'Unknown message type: ' + (msg && msg.type) }); return false; }
  Promise.resolve(fn(msg.payload || {}))
    .then(r => sendResponse(r))
    .catch(e => sendResponse({ ok: false, error: e.message }));
  return true; // keep channel open for async response
});
