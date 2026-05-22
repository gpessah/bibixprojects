import { useEffect, useState, useMemo } from 'react';
import { BarChart2, Clock, Zap, Users, Instagram, ChevronDown, Download, Calendar, UserPlus, Trash2, Plus, Contact, Pencil, X, Search, RefreshCw, ArrowLeft, ExternalLink } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';

type Tab = 'dashboard' | 'history' | 'campaigns' | 'schedule' | 'followers' | 'accounts' | 'research' | 'health';

interface HealthBlock {
  status: 'ok' | 'late' | 'failing' | 'unknown';
}
interface HealthResponse {
  generated_at: string;
  follower_counts: HealthBlock & { last_capture_at: string | null; profiles_tracked: number };
  scheduled_posts: HealthBlock & { by_status: Record<string, number>; overdue: number };
  action_batches: HealthBlock & { by_status: Record<string, number>; stalled_running: number };
  scrape_jobs: HealthBlock & { by_status: Record<string, number>; stalled_running: number };
  extension_activity: HealthBlock & { last_action_at: string | null; actions_last_24h: number };
  permissions: HealthBlock & { users_with_explicit_perms: number; total_users: number };
  accounts: HealthBlock & { count: number };
}

interface ScrapeJob {
  id: string; target_username: string; post_count: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message: string | null; posts_scraped: number;
  created_at: string; started_at: string | null; completed_at: string | null;
}
interface ScrapedPost {
  id: string; target_username: string; shortcode: string; post_url: string;
  post_type: 'post' | 'reel'; likes: number | null; views: number | null;
  comments: number | null; caption: string | null; last_scraped_at: string;
}
interface ScrapedSummary {
  target_username: string; post_count: number; last_scraped_at: string;
}
interface ActionCampaign {
  id: string; name: string | null;
  status: 'draft' | 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  total_requested: number; total_completed: number; concurrency: number;
  consecutive_failures: number; start_at: string | null;
  started_at: string | null; ended_at: string | null;
  error_message: string | null; created_at: string;
}
interface ActionCampaignSummary extends ActionCampaign {
  items_count: number;
  as_account: string | null;
}
interface ActionItem {
  id: string; campaign_id: string; user_id: string; as_account: string;
  post_url: string; action_type: 'like' | 'reply';
  count_requested: number; count_done: number;
  reply_source: string | null; reply_texts: string | null;
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';
  claimed_at: string | null; started_at: string | null; completed_at: string | null;
  error_message: string | null;
}

interface ScheduledPost {
  id: string; my_profile: string | null; post_type: string;
  caption: string | null; media_filename: string | null; media_mime: string | null;
  scheduled_at: string; status: string; posted_at: string | null;
  error_message: string | null; created_at: string;
}
interface FollowerChanges {
  latest:   { id: string; captured_at: string; follower_count: number; my_profile: string | null } | null;
  baseline: { id: string; captured_at: string; follower_count: number } | null;
  gained: string[]; lost: string[];
}
interface Snapshot { id: string; my_profile: string | null; captured_at: string; follower_count: number; }

interface Action {
  id: string;
  type: string;
  username: string | null;
  follower_count: number | null;
  post_url: string | null;
  reply_text: string | null;
  comment_text: string | null;
  campaign_id: string | null;
  created_at: string;
  my_profile: string | null;
  full_name: string | null;
  post_owner: string | null;
  action_date: string | null;
}

interface Campaign {
  id: string; type: string; status: string; actions_count: number;
  new_followers: number; started_at: string; ended_at: string | null; notes: string | null;
}

interface Stats {
  total: number; follows: number; newFollowers: number; followBack: number;
  byType: { type: string; n: number }[];
  daily: { day: string; type: string; n: number }[];
  topUsers: { username: string; n: number }[];
  conversion?: { username: string; followed_at: string; full_name: string | null; follower_count: number | null; followed_back_at: string | null }[];
  bestPosts?: { post_url: string; post_owner: string | null; engaged_users: number; converted: number }[];
}

interface AdminUser {
  id: string; name: string; email: string; total_actions: number;
  total_campaigns: number; last_action: string | null;
}

// ── Labels & colours ──────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  like:                  '❤️ Liked comment',
  comment_reply:         '💬 Replied',
  follow:                '👤 Followed',
  unfollow:              '👋 Unfollowed',
  dm_reply:              '✉️ DM Reply',
  new_follower:          '➕ New Follower',
  received_like_post:    '❤️ Got Like (post)',
  received_like_comment: '❤️ Got Like (comment)',
  received_comment:      '💬 Got Comment',
  received_reply:        '↩️ Got Reply',
  received_mention:      '📣 Got Mentioned',
  reply:                 '💬 Reply',
  notification_scan:     '🔔 Scan',
};

const TYPE_COLOR: Record<string, string> = {
  like:                  'bg-pink-100 text-pink-700',
  comment_reply:         'bg-blue-100 text-blue-700',
  follow:                'bg-green-100 text-green-700',
  unfollow:              'bg-gray-100 text-gray-600',
  dm_reply:              'bg-emerald-100 text-emerald-700',
  new_follower:          'bg-green-100 text-green-800',
  received_like_post:    'bg-rose-100 text-rose-700',
  received_like_comment: 'bg-rose-100 text-rose-700',
  received_comment:      'bg-blue-100 text-blue-700',
  received_reply:        'bg-indigo-100 text-indigo-700',
  received_mention:      'bg-purple-100 text-purple-700',
  reply:                 'bg-blue-100 text-blue-700',
  notification_scan:     'bg-purple-100 text-purple-700',
};

const STATUS_COLOR: Record<string, string> = {
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  stopped:   'bg-gray-100 text-gray-600',
  done:      'bg-green-100 text-green-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShort(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function parseFollowers(val: number | null): number | null {
  if (val == null) return null;
  return val;
}

function displayUsername(u: string | null) {
  if (!u || u === 'unknown') return null;
  return u;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(rows: Action[]) {
  const headers = ['Date', 'My Profile', 'Action', 'Target Username', 'Full Name', 'Followers', 'Reply', 'Post Owner', 'Post URL'];
  const lines = rows.map(r => [
    fmt(r.action_date || r.created_at),
    r.my_profile || '',
    TYPE_LABEL[r.type] || r.type,
    displayUsername(r.username) || '',
    r.full_name || '',
    r.follower_count != null ? r.follower_count : '',
    r.reply_text || r.comment_text || '',
    r.post_owner || '',
    r.post_url || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bibix-ig-history-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InstagramPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const [tab, setTab]               = useState<Tab>('dashboard');
  const [days, setDays]             = useState(30);
  const [asUser, setAsUser]         = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [actions, setActions]       = useState<Action[]>([]);
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(false);

  // ── History filters ──────────────────────────────────────────────────────
  const [fAction,       setFAction]       = useState('');
  const [fProfile,      setFProfile]      = useState('');
  const [fUser,         setFUser]         = useState('');
  const [fPostOwner,    setFPostOwner]    = useState('');
  const [fDateFrom,     setFDateFrom]     = useState('');
  const [fDateTo,       setFDateTo]       = useState('');
  const [fFollowersOp,  setFFollowersOp]  = useState('');
  const [fFollowersVal, setFFollowersVal] = useState('');
  const [fFollowersVal2,setFFollowersVal2]= useState('');

  // ── Pagination ───────────────────────────────────────────────────────────
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(50);

  const qs = asUser ? `?as_user=${asUser}` : '';

  useEffect(() => {
    if (isAdmin) api.get('/instagram/admin/users').then((r: { data: AdminUser[] }) => setAdminUsers(r.data));
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    const q = asUser ? `?days=${days}&as_user=${asUser}` : `?days=${days}`;
    api.get(`/instagram/stats${q}`).then((r: { data: Stats }) => setStats(r.data)).finally(() => setLoading(false));
  }, [days, asUser]);

  useEffect(() => {
    // Load all actions for client-side filtering (matches chrome extension behaviour)
    const q = `${qs ? qs + '&' : '?'}limit=2000`;
    api.get(`/instagram/actions${q}`).then((r: { data: Action[] }) => {
      setActions(r.data);
      setPage(1);
    });
  }, [asUser]);

  useEffect(() => {
    api.get(`/instagram/campaigns${qs}`).then((r: { data: Campaign[] }) => setCampaigns(r.data));
  }, [asUser]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [fAction, fProfile, fUser, fPostOwner, fDateFrom, fDateTo, fFollowersOp, fFollowersVal, fFollowersVal2]);

  // ── Derived: unique filter options ────────────────────────────────────────
  const profiles   = useMemo(() => [...new Set(actions.map(a => a.my_profile).filter(Boolean))].sort() as string[], [actions]);
  const postOwners = useMemo(() => [...new Set(actions.map(a => a.post_owner).filter(Boolean))].sort() as string[], [actions]);

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const fromTs = fDateFrom ? new Date(fDateFrom).getTime()               : null;
    const toTs   = fDateTo   ? new Date(fDateTo + 'T23:59:59').getTime()   : null;
    const fv1    = parseFloat(fFollowersVal);
    const fv2    = parseFloat(fFollowersVal2);

    return actions.filter(a => {
      if (fAction    && a.type !== fAction)                                                return false;
      if (fProfile   && a.my_profile !== fProfile)                                        return false;
      if (fPostOwner && a.post_owner !== fPostOwner)                                      return false;
      if (fUser      && !(displayUsername(a.username) || '').toLowerCase().includes(fUser.toLowerCase())) return false;

      const ts = new Date(a.action_date || a.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs   !== null && ts > toTs)   return false;

      if (fFollowersOp && !isNaN(fv1)) {
        const fc = a.follower_count;
        if (fc == null) return false;
        if (fFollowersOp === 'gt'      && !(fc >  fv1))                   return false;
        if (fFollowersOp === 'gte'     && !(fc >= fv1))                   return false;
        if (fFollowersOp === 'lt'      && !(fc <  fv1))                   return false;
        if (fFollowersOp === 'lte'     && !(fc <= fv1))                   return false;
        if (fFollowersOp === 'eq'      && !(fc === fv1))                  return false;
        if (fFollowersOp === 'between' && !isNaN(fv2) && !(fc >= fv1 && fc <= fv2)) return false;
      }

      return true;
    });
  }, [actions, fAction, fProfile, fUser, fPostOwner, fDateFrom, fDateTo, fFollowersOp, fFollowersVal, fFollowersVal2]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows    = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  function resetFilters() {
    setFAction(''); setFProfile(''); setFUser(''); setFPostOwner('');
    setFDateFrom(''); setFDateTo(''); setFFollowersOp(''); setFFollowersVal(''); setFFollowersVal2('');
  }

  // ── Scheduled posts ──────────────────────────────────────────────────────
  const [scheduled, setScheduled]         = useState<ScheduledPost[]>([]);
  const [newPostFile, setNewPostFile]     = useState<File | null>(null);
  const [newPostCaption, setNewPostCaption] = useState('');
  // AI caption generator
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState<'friendly'|'professional'|'funny'|'inspirational'>('friendly');
  const [aiHashtags, setAiHashtags] = useState(true);
  const [aiComments, setAiComments] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [newPostType, setNewPostType]     = useState<'post' | 'story' | 'reel'>('post');
  const [newPostWhen, setNewPostWhen]     = useState('');
  const [newPostProfile, setNewPostProfile] = useState('');
  const [creatingPost, setCreatingPost]   = useState(false);

  const loadScheduled = () =>
    api.get(`/instagram/scheduled-posts${qs}`)
      .then((r: { data: unknown }) => setScheduled(Array.isArray(r.data) ? r.data as ScheduledPost[] : []))
      .catch(() => setScheduled([]));

  useEffect(() => { if (tab === 'schedule') loadScheduled(); }, [tab, asUser]);

  async function createScheduledPost() {
    if (!newPostFile || !newPostWhen) { alert('Pick a media file and a time.'); return; }
    const fd = new FormData();
    fd.append('media', newPostFile);
    fd.append('caption', newPostCaption);
    fd.append('post_type', newPostType);
    fd.append('scheduled_at', new Date(newPostWhen).toISOString());
    if (newPostProfile) fd.append('my_profile', newPostProfile.replace(/^@/, ''));
    setCreatingPost(true);
    try {
      await api.post('/instagram/scheduled-posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNewPostFile(null); setNewPostCaption(''); setNewPostWhen(''); setNewPostProfile('');
      await loadScheduled();
    } catch (e: unknown) {
      alert('Failed to schedule: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setCreatingPost(false); }
  }

  async function deleteScheduled(id: string) {
    if (!confirm('Delete this scheduled post?')) return;
    await api.delete(`/instagram/scheduled-posts/${id}`);
    await loadScheduled();
  }

  // Encode a small image to base64 so Groq's vision model can see it. Skip
  // for video (Groq doesn't accept video) and for images >4MB to keep the
  // payload reasonable.
  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(bin);
  }

  async function generateAICaption() {
    if (!aiTopic.trim() && !aiComments.trim() && !newPostFile) {
      alert('Add a topic, some notes, or upload a file first.'); return;
    }
    setAiBusy(true);
    try {
      let imageB64: string | null = null;
      let mimeType: string | null = null;
      if (newPostFile && newPostFile.type.startsWith('image/') && newPostFile.size <= 4 * 1024 * 1024) {
        const buf = await newPostFile.arrayBuffer();
        imageB64 = arrayBufferToBase64(buf);
        mimeType = newPostFile.type;
      }
      const res = await api.post(`/instagram/ai-caption${qs}`, {
        topic: aiTopic,
        tone: aiTone,
        include_hashtags: aiHashtags,
        comments: aiComments,
        image_b64: imageB64,
        mime_type: mimeType,
      });
      if (res.data?.caption) setNewPostCaption(res.data.caption);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (e instanceof Error ? e.message : String(e));
      alert('Failed to generate caption: ' + msg);
    } finally { setAiBusy(false); }
  }

  // ── Follower snapshots / changes ─────────────────────────────────────────
  const [changes, setChanges]               = useState<FollowerChanges | null>(null);
  const [snapshots, setSnapshots]           = useState<Snapshot[]>([]);
  const [followerDays, setFollowerDays]     = useState(7);
  const [followerProfile, setFollowerProfile] = useState('');

  // ── Daily follower-count history ─────────────────────────────────────────
  interface FollowerCountPoint { bucket: string; follower_count: number; delta: number | null }
  interface FollowerCountSeries { my_profile: string; points: FollowerCountPoint[] }
  const [followerCountSeries, setFollowerCountSeries] = useState<FollowerCountSeries[]>([]);
  const [followerCountAgg, setFollowerCountAgg] = useState<'day'|'month'>('day');
  const [followerCountProfile, setFollowerCountProfile] = useState('');
  const [followerRefreshBusy, setFollowerRefreshBusy] = useState(false);
  const [followerRefreshNote, setFollowerRefreshNote] = useState<string | null>(null);

  async function triggerFollowerCountNow() {
    setFollowerRefreshBusy(true);
    setFollowerRefreshNote(null);
    try {
      await api.post(`/instagram/follower-counts/trigger${qs}`);
      setFollowerRefreshNote('Triggered — counts will appear within ~2 minutes on the device with Automation enabled.');
      // Poll for fresh data a few times after the trigger
      const reload = async () => {
        const profile = followerCountProfile ? `&my_profile=${encodeURIComponent(followerCountProfile)}` : '';
        const sep = qs ? `${qs}&` : '?';
        try {
          const r = await api.get(`/instagram/follower-counts${sep}aggregate=${followerCountAgg}${profile}`);
          setFollowerCountSeries(Array.isArray(r.data) ? r.data as FollowerCountSeries[] : []);
        } catch (_) {}
      };
      setTimeout(reload, 60000);
      setTimeout(reload, 120000);
      setTimeout(reload, 180000);
    } catch (e: unknown) {
      setFollowerRefreshNote('Failed to trigger: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFollowerRefreshBusy(false);
    }
  }

  useEffect(() => {
    if (tab !== 'followers') return;
    const profile = followerCountProfile ? `&my_profile=${encodeURIComponent(followerCountProfile)}` : '';
    const sep = qs ? `${qs}&` : '?';
    api.get(`/instagram/follower-counts${sep}aggregate=${followerCountAgg}${profile}`)
      .then((r: { data: unknown }) => setFollowerCountSeries(Array.isArray(r.data) ? r.data as FollowerCountSeries[] : []))
      .catch(() => setFollowerCountSeries([]));
  }, [tab, asUser, followerCountAgg, followerCountProfile]);

  // ── Multi-account: list of detected Instagram accounts ──────────────────
  const [igAccounts, setIgAccounts] = useState<string[]>([]);
  const [newAccount, setNewAccount] = useState('');
  const loadAccounts = () =>
    api.get(`/instagram/accounts${qs}`)
      .then((r: { data: unknown }) => setIgAccounts(Array.isArray(r.data) ? r.data as string[] : []))
      .catch(() => setIgAccounts([]));
  useEffect(() => { loadAccounts(); }, [asUser]);
  async function addAccount() {
    const u = newAccount.trim().replace(/^@/, '');
    if (!u) return;
    try {
      await api.post('/instagram/accounts', { username: u });
      setNewAccount('');
      await loadAccounts();
    } catch (e: unknown) {
      alert('Could not add account: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function removeAccount(username: string) {
    if (!confirm(`Remove @${username} from the account list? (does not affect Instagram)`)) return;
    await api.delete(`/instagram/accounts/${encodeURIComponent(username)}`);
    await loadAccounts();
  }

  // ── Edit a scheduled post ────────────────────────────────────────────────
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editType, setEditType] = useState<'post' | 'story' | 'reel'>('post');
  const [editWhen, setEditWhen] = useState('');
  const [editProfile, setEditProfile] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  function openEdit(p: ScheduledPost) {
    setEditingPost(p);
    setEditCaption(p.caption || '');
    setEditType((p.post_type as 'post' | 'story' | 'reel') || 'post');
    // Convert ISO to local datetime-local string (yyyy-MM-ddTHH:mm)
    const d = new Date(p.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEditProfile(p.my_profile || '');
    setEditFile(null);
  }
  async function saveEdit() {
    if (!editingPost) return;
    setSavingEdit(true);
    try {
      await api.patch(`/instagram/scheduled-posts/${editingPost.id}`, {
        caption: editCaption,
        post_type: editType,
        scheduled_at: new Date(editWhen).toISOString(),
        my_profile: editProfile || null,
      });
      if (editFile) {
        const fd = new FormData();
        fd.append('media', editFile);
        await api.post(`/instagram/scheduled-posts/${editingPost.id}/media`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setEditingPost(null);
      await loadScheduled();
    } catch (e: unknown) {
      alert('Save failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSavingEdit(false); }
  }

  // ── Profile research (scrape jobs + results) ─────────────────────────────
  const [scrapeJobs,    setScrapeJobs]    = useState<ScrapeJob[]>([]);
  const [scrapedSummary, setScrapedSummary] = useState<ScrapedSummary[]>([]);
  const [scrapeTarget,  setScrapeTarget]  = useState('');
  const [scrapeCount,   setScrapeCount]   = useState('25');
  const [scrapeBusy,    setScrapeBusy]    = useState(false);
  const [viewingUser,   setViewingUser]   = useState<string | null>(null);
  const [viewingPosts,  setViewingPosts]  = useState<ScrapedPost[]>([]);

  const loadResearch = async () => {
    try {
      const [jobsRes, summaryRes] = await Promise.all([
        api.get(`/instagram/scrape-jobs${qs}`),
        api.get(`/instagram/scraped-posts${qs}`),
      ]);
      setScrapeJobs(Array.isArray(jobsRes.data) ? jobsRes.data as ScrapeJob[] : []);
      setScrapedSummary(Array.isArray(summaryRes.data) ? summaryRes.data as ScrapedSummary[] : []);
    } catch (_) { /* keep prior state */ }
  };

  useEffect(() => { if (tab === 'research') loadResearch(); }, [tab, asUser]);

  // Auto-refresh research view while a job is pending or running so the user
  // sees status updates without manually reloading.
  useEffect(() => {
    if (tab !== 'research') return;
    const hasActive = scrapeJobs.some(j => j.status === 'pending' || j.status === 'running');
    if (!hasActive) return;
    const id = setInterval(loadResearch, 5000);
    return () => clearInterval(id);
  }, [tab, scrapeJobs, asUser]);

  async function createScrapeJob() {
    const target = scrapeTarget.trim().replace(/^@/, '').toLowerCase();
    if (!target) { alert('Enter an Instagram username (e.g. elizabethvasilenko)'); return; }
    const count = Math.max(1, Math.min(200, parseInt(scrapeCount, 10) || 25));
    setScrapeBusy(true);
    try {
      await api.post(`/instagram/scrape-jobs${qs}`, { target_username: target, post_count: count });
      setScrapeTarget('');
      await loadResearch();
    } catch (e: unknown) {
      alert('Failed to queue scrape: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setScrapeBusy(false); }
  }

  async function openScrapedUser(username: string) {
    setViewingUser(username);
    setViewingPosts([]);
    setSelectedPosts(new Set());
    try {
      const res = await api.get(`/instagram/scraped-posts${qs ? qs + '&' : '?'}target_username=${encodeURIComponent(username)}`);
      setViewingPosts(Array.isArray(res.data) ? res.data as ScrapedPost[] : []);
    } catch (_) { setViewingPosts([]); }
  }

  // ── System health (admin-only QA dashboard) ──────────────────────────────
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const loadHealth = async () => {
    setHealthBusy(true);
    try {
      const r = await api.get('/instagram/admin/health');
      setHealth(r.data as HealthResponse);
    } catch (_) { setHealth(null); }
    finally { setHealthBusy(false); }
  };
  useEffect(() => {
    if (tab === 'health' && isAdmin) loadHealth();
  }, [tab, isAdmin]);

  // ── Action campaigns (drafts that you build up, then Send) ───────────────
  // Flow: create empty draft → add up to 6 items (from Research or by URL)
  // → click Send → extension picks it up. Items can be edited (count) or
  // removed while still 'pending'; new items can be appended even after Send
  // (up to the 6-cap), as long as the campaign isn't completed/cancelled.
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [actionCampaigns, setActionCampaigns] = useState<ActionCampaignSummary[]>([]);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<ActionItem[]>([]);

  // Create-campaign modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createAccount, setCreateAccount] = useState('');
  const [createFreeText, setCreateFreeText] = useState('');
  const [createConcurrency, setCreateConcurrency] = useState('6');
  const [createStartAt, setCreateStartAt] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Add-to-campaign modal (triggered from Research)
  const [showAddToCampaign, setShowAddToCampaign] = useState(false);
  const [addToCampaignId, setAddToCampaignId] = useState('');
  const [addToActionType, setAddToActionType] = useState<'like' | 'reply'>('like');
  const [addToCount, setAddToCount] = useState('3');
  const [addToReplySource, setAddToReplySource] = useState<'default' | 'custom' | 'ai'>('default');
  const [addToReplyText, setAddToReplyText] = useState('');
  const [addToBusy, setAddToBusy] = useState(false);

  // Add-by-URL form inside campaign detail
  const [byUrlInput, setByUrlInput] = useState('');
  const [byUrlActionType, setByUrlActionType] = useState<'like' | 'reply'>('like');
  const [byUrlCount, setByUrlCount] = useState('3');
  const [byUrlReplySource, setByUrlReplySource] = useState<'default' | 'custom' | 'ai'>('default');
  const [byUrlReplyText, setByUrlReplyText] = useState('');
  const [byUrlBusy, setByUrlBusy] = useState(false);

  const loadActionCampaigns = async () => {
    try {
      const res = await api.get(`/instagram/action-campaigns${qs}`);
      setActionCampaigns(Array.isArray(res.data) ? res.data as ActionCampaignSummary[] : []);
    } catch (_) { /* keep state */ }
  };
  const loadExpandedItems = async (id: string) => {
    try {
      const res = await api.get(`/instagram/action-campaigns/${id}${qs}`);
      setExpandedItems(Array.isArray(res.data?.items) ? res.data.items as ActionItem[] : []);
    } catch (_) { setExpandedItems([]); }
  };

  useEffect(() => {
    if (tab === 'campaigns') loadActionCampaigns();
  }, [tab, asUser]);

  useEffect(() => {
    if (tab !== 'campaigns') return;
    const active = actionCampaigns.some(c => c.status === 'pending' || c.status === 'running');
    if (!active && !expandedCampaign) return;
    const id = setInterval(() => {
      loadActionCampaigns();
      if (expandedCampaign) loadExpandedItems(expandedCampaign);
    }, 5000);
    return () => clearInterval(id);
  }, [tab, actionCampaigns, expandedCampaign, asUser]);

  function togglePostSelection(postId: string) {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }

  async function createCampaign() {
    if (!createAccount) { alert('Pick an Instagram account for the campaign.'); return; }
    const conc = Math.max(1, Math.min(6, parseInt(createConcurrency, 10) || 6));
    setCreateBusy(true);
    try {
      const res = await api.post(`/instagram/action-campaigns${qs}`, {
        as_account: createAccount,
        concurrency: conc,
        free_text: createFreeText || null,
        start_at: createStartAt ? new Date(createStartAt).toISOString() : null,
      });
      setShowCreateModal(false);
      setCreateFreeText('');
      setCreateStartAt('');
      await loadActionCampaigns();
      // Open it for immediate item-adding
      const newId = res.data?.id;
      if (newId) { setExpandedCampaign(newId); loadExpandedItems(newId); }
    } catch (e: unknown) {
      alert('Failed to create campaign: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setCreateBusy(false); }
  }

  function openAddToCampaign() {
    // Default to the most-recent draft if any, else first non-completed campaign
    const eligible = actionCampaigns.filter(c =>
      c.status !== 'completed' && c.status !== 'cancelled' && (c.items_count ?? 0) < 6
    );
    setAddToCampaignId(eligible[0]?.id || '');
    setShowAddToCampaign(true);
  }

  async function submitAddToCampaign() {
    if (!addToCampaignId) { alert('Pick a campaign first (or create a new one).'); return; }
    const count = Math.max(1, parseInt(addToCount, 10) || 1);
    const selected = viewingPosts.filter(p => selectedPosts.has(p.id));
    if (selected.length === 0) { alert('No posts selected.'); return; }
    const camp = actionCampaigns.find(c => c.id === addToCampaignId);
    const remaining = camp ? 6 - (camp.items_count ?? 0) : 6;
    if (selected.length > remaining) {
      alert(`That campaign has room for only ${remaining} more post(s). You selected ${selected.length}. Remove some or create a new campaign.`);
      return;
    }
    const customReplies = addToReplySource === 'custom'
      ? addToReplyText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
    if (addToActionType === 'reply' && addToReplySource === 'custom' && customReplies.length === 0) {
      alert('Custom reply source picked but no reply text provided.'); return;
    }
    setAddToBusy(true);
    try {
      // Add items sequentially to keep the 6-cap consistent. (Parallel would
      // race on the server-side count check.)
      for (const p of selected) {
        await api.post(`/instagram/action-campaigns/${addToCampaignId}/items${qs}`, {
          post_url: p.post_url,
          action_type: addToActionType,
          count,
          reply_source: addToActionType === 'reply' ? addToReplySource : undefined,
          reply_texts: addToActionType === 'reply' && addToReplySource === 'custom' ? customReplies : undefined,
        });
      }
      setShowAddToCampaign(false);
      setSelectedPosts(new Set());
      setAddToReplyText('');
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to add to campaign: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setAddToBusy(false); }
  }

  async function addByUrl(campaignId: string) {
    const url = byUrlInput.trim();
    if (!url) { alert('Paste an Instagram post URL.'); return; }
    const count = Math.max(1, parseInt(byUrlCount, 10) || 1);
    const customReplies = byUrlReplySource === 'custom'
      ? byUrlReplyText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
    if (byUrlActionType === 'reply' && byUrlReplySource === 'custom' && customReplies.length === 0) {
      alert('Custom reply source picked but no reply text provided.'); return;
    }
    setByUrlBusy(true);
    try {
      await api.post(`/instagram/action-campaigns/${campaignId}/items${qs}`, {
        post_url: url,
        action_type: byUrlActionType,
        count,
        reply_source: byUrlActionType === 'reply' ? byUrlReplySource : undefined,
        reply_texts: byUrlActionType === 'reply' && byUrlReplySource === 'custom' ? customReplies : undefined,
      });
      setByUrlInput('');
      setByUrlReplyText('');
      await loadActionCampaigns();
      await loadExpandedItems(campaignId);
    } catch (e: unknown) {
      alert('Failed to add: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setByUrlBusy(false); }
  }

  async function patchItemCount(campaignId: string, itemId: string, count: number) {
    try {
      await api.patch(`/instagram/action-campaigns/${campaignId}/items/${itemId}${qs}`, {
        count_requested: Math.max(1, count),
      });
      await loadExpandedItems(campaignId);
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to update count: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function removeItem(campaignId: string, itemId: string) {
    if (!confirm('Remove this post from the campaign?')) return;
    try {
      await api.delete(`/instagram/action-campaigns/${campaignId}/items/${itemId}${qs}`);
      await loadExpandedItems(campaignId);
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to remove: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function sendCampaign(id: string) {
    try {
      await api.post(`/instagram/action-campaigns/${id}/send${qs}`);
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to send: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function patchCampaignStartAt(id: string, datetimeLocal: string) {
    try {
      await api.patch(`/instagram/action-campaigns/${id}${qs}`, {
        start_at: datetimeLocal ? new Date(datetimeLocal).toISOString() : null,
      });
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to update start time: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign and all its items permanently?')) return;
    try {
      await api.delete(`/instagram/action-campaigns/${id}${qs}`);
      if (expandedCampaign === id) { setExpandedCampaign(null); setExpandedItems([]); }
      await loadActionCampaigns();
    } catch (e: unknown) {
      alert('Failed to delete: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function cancelActionCampaign(id: string) {
    if (!confirm('Cancel this campaign? Pending actions will be skipped; in-flight ones finish.')) return;
    await api.post(`/instagram/action-campaigns/${id}/cancel${qs}`);
    await loadActionCampaigns();
  }
  async function resumeActionCampaign(id: string) {
    await api.post(`/instagram/action-campaigns/${id}/resume${qs}`);
    await loadActionCampaigns();
  }

  useEffect(() => {
    if (tab !== 'followers') return;
    const p   = followerProfile ? `&my_profile=${encodeURIComponent(followerProfile)}` : '';
    const sep = qs ? `${qs}&` : '?';
    api.get(`/instagram/followers/changes${sep}days=${followerDays}${p}`)
      .then((r: { data: Partial<FollowerChanges> }) => setChanges({
        latest:   r.data?.latest   || null,
        baseline: r.data?.baseline || null,
        gained:   Array.isArray(r.data?.gained) ? r.data.gained : [],
        lost:     Array.isArray(r.data?.lost)   ? r.data.lost   : [],
      }))
      .catch(() => setChanges({ latest: null, baseline: null, gained: [], lost: [] }));
    api.get(`/instagram/followers/snapshots${qs}${p ? (qs ? '&' : '?') + `my_profile=${encodeURIComponent(followerProfile)}` : ''}`)
      .then((r: { data: unknown }) => setSnapshots(Array.isArray(r.data) ? r.data as Snapshot[] : []))
      .catch(() => setSnapshots([]));
  }, [tab, asUser, followerDays, followerProfile]);

  const TABS = [
    { id: 'dashboard' as Tab, label: 'Dashboard', icon: <BarChart2 size={15} /> },
    { id: 'history'   as Tab, label: 'History',   icon: <Clock size={15} /> },
    { id: 'campaigns' as Tab, label: 'Campaigns', icon: <Zap size={15} /> },
    { id: 'schedule'  as Tab, label: 'Schedule',  icon: <Calendar size={15} /> },
    { id: 'followers' as Tab, label: 'Followers', icon: <UserPlus size={15} /> },
    { id: 'accounts'  as Tab, label: 'Accounts',  icon: <Contact size={15} /> },
    { id: 'research'  as Tab, label: 'Research',  icon: <Search size={15} /> },
    ...(isAdmin ? [{ id: 'health' as Tab, label: 'Health', icon: <Zap size={15} /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Instagram size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Instagram Analytics</h1>
              <p className="text-sm text-gray-500">Track your automation history and performance</p>
            </div>
          </div>
          {isAdmin && adminUsers.length > 0 && (
            <div className="relative">
              <select value={asUser} onChange={e => setAsUser(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">My data</option>
                {adminUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.total_actions} actions)</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ══════════════════════════════ DASHBOARD ══════════════════════════════ */}
        {tab === 'dashboard' && (
          <div>
            <div className="flex gap-2 mb-6">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {d} days
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : stats && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Total Actions',  value: stats.total,                    color: 'text-blue-600',   bg: 'bg-blue-50' },
                    { label: 'Follows Sent',   value: stats.follows,                  color: 'text-green-600',  bg: 'bg-green-50' },
                    { label: 'New Followers',  value: stats.newFollowers,             color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Follow-back %',  value: `${stats.followBack}%`,         color: 'text-orange-600', bg: 'bg-orange-50' },
                  ].map(c => (
                    <div key={c.label} className={`${c.bg} rounded-xl p-5`}>
                      <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
                      <div className="text-sm text-gray-600 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Actions by Type</h3>
                    <div className="space-y-3">
                      {(stats.byType || []).map(r => (
                        <div key={r.type} className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TYPE_COLOR[r.type] || 'bg-gray-100 text-gray-600'}`}>
                            {TYPE_LABEL[r.type] || r.type}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${Math.min(100, (r.n / Math.max(stats.total, 1)) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 w-10 text-right">{r.n}</span>
                        </div>
                      ))}
                      {(stats.byType || []).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Top Users Engaged</h3>
                    <div className="space-y-2">
                      {(stats.topUsers || []).map((u, i) => (
                        <div key={u.username} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                          <a href={`https://instagram.com/${u.username}`} target="_blank" rel="noreferrer"
                            className="text-sm font-medium text-blue-500 hover:underline flex-1">
                            @{u.username}
                          </a>
                          <span className="text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded-full">{u.n}</span>
                        </div>
                      ))}
                      {(stats.topUsers || []).length === 0 && <p className="text-gray-400 text-sm">No data yet</p>}
                    </div>
                  </div>
                </div>

                {/* ── Activity Over Time ── */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">📅 Activity Over Time</h3>
                  {(() => {
                    const daily = stats.daily || [];
                    if (daily.length === 0) return <p className="text-gray-400 text-sm">No data yet</p>;
                    // Pivot daily rows into per-day totals split outbound/inbound
                    const OUTBOUND = new Set(['like', 'comment', 'reply', 'comment_reply', 'follow', 'unfollow']);
                    const INBOUND  = new Set(['new_follower', 'new_like', 'new_comment']);
                    const days: Record<string, { outbound: number; inbound: number }> = {};
                    for (const row of daily) {
                      if (!days[row.day]) days[row.day] = { outbound: 0, inbound: 0 };
                      if (OUTBOUND.has(row.type)) days[row.day].outbound += row.n;
                      else if (INBOUND.has(row.type)) days[row.day].inbound += row.n;
                    }
                    const sortedDays = Object.keys(days).sort();
                    const maxVal = Math.max(1, ...sortedDays.map(d => Math.max(days[d].outbound, days[d].inbound)));
                    return (
                      <>
                        <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                          {sortedDays.map(d => {
                            const v = days[d];
                            const outH = (v.outbound / maxVal) * 100;
                            const inH = (v.inbound / maxVal) * 100;
                            return (
                              <div key={d} className="flex flex-col items-center min-w-[40px]">
                                <div className="flex items-end gap-0.5 h-28">
                                  <div className="w-3 bg-blue-500 rounded-t" style={{ height: `${outH}%` }} title={`${v.outbound} outbound`} />
                                  <div className="w-3 bg-green-500 rounded-t" style={{ height: `${inH}%` }} title={`${v.inbound} inbound`} />
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 -rotate-45 origin-top-left whitespace-nowrap">{d.slice(5)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-4 text-xs text-gray-600 mt-4">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm" /> Outbound (likes / replies / follows)</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm" /> Inbound (new followers)</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* ── Who Followed You Back ── */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">🔄 Who Followed You Back</h3>
                  {(stats.conversion || []).length === 0 ? (
                    <p className="text-gray-400 text-sm">No follow actions in this period yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                            <th className="py-2 pr-3 font-medium">User</th>
                            <th className="py-2 pr-3 font-medium">Followers</th>
                            <th className="py-2 pr-3 font-medium">You followed</th>
                            <th className="py-2 pr-3 font-medium">Followed back?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(stats.conversion || []).slice(0, 30).map(c => (
                            <tr key={c.username + c.followed_at} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 pr-3">
                                <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer"
                                  className="text-blue-600 hover:underline font-medium">@{c.username}</a>
                                {c.full_name && <span className="text-xs text-gray-400 ml-2">({c.full_name})</span>}
                              </td>
                              <td className="py-2 pr-3 text-gray-600 text-xs">{c.follower_count != null ? c.follower_count.toLocaleString() : '—'}</td>
                              <td className="py-2 pr-3 text-gray-500 text-xs">{fmt(c.followed_at)}</td>
                              <td className="py-2 pr-3">
                                {c.followed_back_at ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    ✓ {fmt(c.followed_back_at)}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(() => {
                        const c = stats.conversion || [];
                        const back = c.filter(r => r.followed_back_at).length;
                        const rate = c.length > 0 ? Math.round((back / c.length) * 100) : 0;
                        return (
                          <div className="mt-3 text-xs text-gray-600">
                            <b>{back}</b> of {c.length} followed back ({rate}%)
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* ── Best Posts by Follower Conversion ── */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">🏆 Best Posts by Follower Conversion</h3>
                  {(stats.bestPosts || []).length === 0 ? (
                    <p className="text-gray-400 text-sm">No engagement on tracked posts yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                            <th className="py-2 pr-3 font-medium">Post</th>
                            <th className="py-2 pr-3 font-medium">Owner</th>
                            <th className="py-2 pr-3 font-medium text-right">Engaged</th>
                            <th className="py-2 pr-3 font-medium text-right">Converted</th>
                            <th className="py-2 pr-3 font-medium text-right">Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(stats.bestPosts || []).map(p => {
                            const rate = p.engaged_users > 0 ? Math.round((p.converted / p.engaged_users) * 100) : 0;
                            const short = p.post_url.match(/\/(p|reel)\/([\w-]+)/)?.[2] || p.post_url.slice(-12);
                            return (
                              <tr key={p.post_url} className="border-b border-gray-50 last:border-0">
                                <td className="py-2 pr-3">
                                  <a href={p.post_url} target="_blank" rel="noreferrer"
                                    className="text-blue-600 hover:underline text-xs">{short}</a>
                                </td>
                                <td className="py-2 pr-3 text-gray-600 text-xs">{p.post_owner ? `@${p.post_owner}` : '—'}</td>
                                <td className="py-2 pr-3 text-right">{p.engaged_users}</td>
                                <td className="py-2 pr-3 text-right text-green-600 font-medium">{p.converted}</td>
                                <td className="py-2 pr-3 text-right">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    rate >= 30 ? 'bg-green-100 text-green-700' :
                                    rate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                                                 'bg-gray-100 text-gray-600'
                                  }`}>{rate}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════ HISTORY ══════════════════════════════ */}
        {tab === 'history' && (
          <div>
            {/* ── Filter panel ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              {/* Row 1 */}
              <div className="flex flex-wrap gap-3 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</label>
                  <select value={fAction} onChange={e => setFAction(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]">
                    <option value="">All actions</option>
                    <optgroup label="Your actions">
                      <option value="like">❤️ Liked a comment</option>
                      <option value="comment_reply">💬 Replied to comment</option>
                      <option value="follow">👤 Followed someone</option>
                      <option value="unfollow">👋 Unfollowed someone</option>
                      <option value="dm_reply">✉️ DM Reply</option>
                    </optgroup>
                    <optgroup label="From notifications">
                      <option value="new_follower">➕ New Follower</option>
                      <option value="received_like_post">❤️ Got Like on post</option>
                      <option value="received_like_comment">❤️ Got Like on comment</option>
                      <option value="received_comment">💬 Got Comment</option>
                      <option value="received_reply">↩️ Got Reply</option>
                      <option value="received_mention">📣 Got Mentioned</option>
                    </optgroup>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">My Profile</label>
                  <select value={fProfile} onChange={e => setFProfile(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]">
                    <option value="">All profiles</option>
                    {profiles.map(p => <option key={p} value={p}>@{p}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Target Username</label>
                  <input value={fUser} onChange={e => setFUser(e.target.value)}
                    placeholder="Filter by username…"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Post Owner</label>
                  <select value={fPostOwner} onChange={e => setFPostOwner(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]">
                    <option value="">All post owners</option>
                    {postOwners.map(p => <option key={p} value={p}>@{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date From</label>
                  <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date To</label>
                  <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Followers</label>
                  <div className="flex gap-2 items-center">
                    <select value={fFollowersOp} onChange={e => setFFollowersOp(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Any</option>
                      <option value="gt">Greater than</option>
                      <option value="gte">Greater or equal</option>
                      <option value="lt">Less than</option>
                      <option value="lte">Less or equal</option>
                      <option value="eq">Equal to</option>
                      <option value="between">Between</option>
                    </select>
                    {fFollowersOp && (
                      <input type="number" value={fFollowersVal} onChange={e => setFFollowersVal(e.target.value)}
                        placeholder="e.g. 1000" min="0"
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
                    )}
                    {fFollowersOp === 'between' && (
                      <>
                        <span className="text-sm text-gray-400">and</span>
                        <input type="number" value={fFollowersVal2} onChange={e => setFFollowersVal2(e.target.value)}
                          placeholder="e.g. 5000" min="0"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
                      </>
                    )}
                  </div>
                </div>

                <button onClick={resetFilters}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                  ✕ Reset Filters
                </button>
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 1000 }}>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">My Profile</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Action</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Target User</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Full Name</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Followers</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Reply</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Post Owner</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Post URL</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(a => {
                    const targetUser = displayUsername(a.username);
                    return (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {fmtShort(a.action_date || a.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          {a.my_profile ? `@${a.my_profile}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TYPE_COLOR[a.type] || 'bg-gray-100 text-gray-600'}`}>
                            {TYPE_LABEL[a.type] || a.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {targetUser
                            ? <a href={`https://instagram.com/${targetUser}`} target="_blank" rel="noreferrer"
                                className="text-blue-500 hover:underline">@{targetUser}</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.full_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {a.follower_count != null ? Number(a.follower_count).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate"
                          title={a.reply_text || a.comment_text || ''}>
                          {a.reply_text || a.comment_text || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.post_owner
                            ? <a href={`https://instagram.com/${a.post_owner}`} target="_blank" rel="noreferrer"
                                className="text-blue-500 hover:underline">@{a.post_owner}</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {a.post_url
                            ? <a href={a.post_url} target="_blank" rel="noreferrer"
                                className="text-blue-500 hover:underline whitespace-nowrap">Open ↗</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                        {actions.length === 0 ? 'No actions recorded yet. Run the extension to start tracking.' : 'No records match your filters.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Bottom bar: count + pagination + per-page + export ── */}
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <span className="text-sm text-gray-500">
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                {filtered.length > 0 && ` — showing ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filtered.length)}`}
              </span>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .reduce<(number | '…')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) => p === '…'
                      ? <span key={`e${i}`} className="px-2 text-gray-400">…</span>
                      : <button key={p} onClick={() => setPage(p as number)}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${currentPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {p}
                        </button>
                    )}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    Next ›
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  Rows:
                  <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white">
                    {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={() => exportCSV(filtered)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {tab === 'schedule' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Plus size={18} /> Schedule a post</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="text-gray-600">Media file</span>
                  <input type="file" accept="image/*,video/*" onChange={e => setNewPostFile(e.target.files?.[0] || null)}
                    className="block w-full mt-1 text-sm" />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Post type</span>
                  <select value={newPostType} onChange={e => setNewPostType(e.target.value as 'post' | 'story' | 'reel')}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm">
                    <option value="post">Post</option>
                    <option value="story">Story</option>
                    <option value="reel">Reel</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Publish at</span>
                  <input type="datetime-local" value={newPostWhen} onChange={e => setNewPostWhen(e.target.value)}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Instagram account</span>
                  {igAccounts.length > 0 ? (
                    <select value={newPostProfile} onChange={e => setNewPostProfile(e.target.value)}
                      className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm">
                      <option value="">— Any / current —</option>
                      {igAccounts.map(a => <option key={a} value={a}>@{a}</option>)}
                    </select>
                  ) : (
                    <input type="text" placeholder="@myhandle (scan accounts in the extension to enable dropdown)" value={newPostProfile}
                      onChange={e => setNewPostProfile(e.target.value)}
                      className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                  )}
                </label>
                <label className="text-sm col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Caption</span>
                    <button type="button" onClick={() => setShowAIPanel(s => !s)}
                      className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium">
                      ✨ {showAIPanel ? 'Hide AI' : 'Generate with AI'}
                    </button>
                  </div>
                  {showAIPanel && (
                    <div className="mt-2 mb-2 p-3 border border-purple-100 rounded-lg bg-purple-50/40">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Topic / what's the post about</label>
                          <textarea rows={2} value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                            placeholder="e.g. our new spring collection launch"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Notes / additional context</label>
                          <textarea rows={2} value={aiComments} onChange={e => setAiComments(e.target.value)}
                            placeholder="e.g. mention free shipping, ask a question"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">Tone:</label>
                          <select value={aiTone} onChange={e => setAiTone(e.target.value as 'friendly'|'professional'|'funny'|'inspirational')}
                            className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                            <option value="friendly">Friendly</option>
                            <option value="professional">Professional</option>
                            <option value="funny">Funny</option>
                            <option value="inspirational">Inspirational</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-1 text-xs text-gray-700">
                          <input type="checkbox" checked={aiHashtags} onChange={e => setAiHashtags(e.target.checked)} />
                          Include hashtags
                        </label>
                        <button type="button" onClick={generateAICaption} disabled={aiBusy}
                          className="ml-auto px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                          {aiBusy ? 'Generating…' : '✨ Generate'}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {newPostFile && newPostFile.type.startsWith('image/') && newPostFile.size <= 4 * 1024 * 1024
                          ? '🖼 Vision model — caption will be based on the image you uploaded.'
                          : newPostFile && newPostFile.type.startsWith('video/')
                          ? '🎥 Video file — AI uses your topic/notes only (Groq can\'t analyze video frames).'
                          : newPostFile
                          ? 'File too large for vision (over 4MB) — AI uses your topic/notes only.'
                          : 'No file uploaded — AI uses your topic/notes only.'}
                      </p>
                    </div>
                  )}
                  <textarea rows={3} value={newPostCaption} onChange={e => setNewPostCaption(e.target.value)}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </label>
              </div>
              <button onClick={createScheduledPost} disabled={creatingPost}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {creatingPost ? 'Scheduling…' : 'Schedule post'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Scheduled for</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Account</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Caption</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(p.scheduled_at)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 capitalize">{p.post_type}</span></td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.my_profile ? `@${p.my_profile}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[300px] truncate" title={p.caption || ''}>{p.caption || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'posted'    ? 'bg-green-100 text-green-700' :
                          p.status === 'failed'    ? 'bg-red-100 text-red-700' :
                          p.status === 'claimed'   ? 'bg-yellow-100 text-yellow-700' :
                                                     'bg-blue-100 text-blue-700'
                        }`}>{p.status}</span>
                        {p.error_message && <div className="text-xs text-red-500 mt-1" title={p.error_message}>⚠ {p.error_message.slice(0, 60)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {!['posted', 'claimed'].includes(p.status) && (
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-500" title="Edit"><Pencil size={16} /></button>
                            <button onClick={() => deleteScheduled(p.id)} className="text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {scheduled.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No scheduled posts. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FOLLOWERS ── */}
        {tab === 'followers' && (
          <div className="space-y-6">
            <div className="flex gap-3 items-center">
              <input type="text" placeholder="Filter by @profile (optional)" value={followerProfile}
                onChange={e => setFollowerProfile(e.target.value.replace(/^@/, ''))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs" />
              <div className="flex gap-2">
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => setFollowerDays(d)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${followerDays === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {changes?.latest ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-xl p-5">
                    <div className="text-3xl font-bold text-blue-600">{changes.latest.follower_count}</div>
                    <div className="text-sm text-gray-600 mt-1">Current followers</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-5">
                    <div className="text-3xl font-bold text-green-600">+{changes.gained.length}</div>
                    <div className="text-sm text-gray-600 mt-1">Gained (last {followerDays}d)</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-5">
                    <div className="text-3xl font-bold text-red-600">−{changes.lost.length}</div>
                    <div className="text-sm text-gray-600 mt-1">Lost (last {followerDays}d)</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-green-700 mb-3">➕ Gained</h3>
                    <div className="space-y-1 max-h-80 overflow-auto">
                      {changes.gained.length === 0 && <p className="text-gray-400 text-sm">No new followers in this period.</p>}
                      {changes.gained.map(u => (
                        <a key={u} href={`https://instagram.com/${u}`} target="_blank" rel="noreferrer"
                          className="block text-sm text-blue-600 hover:underline">@{u}</a>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-red-700 mb-3">➖ Lost</h3>
                    <div className="space-y-1 max-h-80 overflow-auto">
                      {changes.lost.length === 0 && <p className="text-gray-400 text-sm">No unfollows in this period.</p>}
                      {changes.lost.map(u => (
                        <a key={u} href={`https://instagram.com/${u}`} target="_blank" rel="noreferrer"
                          className="block text-sm text-blue-600 hover:underline">@{u}</a>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <UserPlus size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No follower snapshots yet. Open the extension on instagram.com and click "Snapshot followers" to start tracking.</p>
              </div>
            )}

            {snapshots.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Snapshot history</h3>
                <div className="space-y-1 text-sm">
                  {snapshots.map(s => (
                    <div key={s.id} className="flex justify-between text-gray-600">
                      <span>{fmt(s.captured_at)} {s.my_profile && `· @${s.my_profile}`}</span>
                      <span className="font-semibold">{s.follower_count} followers</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Daily follower count history (auto-scraped by the extension) ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="font-semibold text-gray-900">Daily follower history</h3>
                <div className="flex items-center gap-2">
                  <button onClick={triggerFollowerCountNow} disabled={followerRefreshBusy}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                    <RefreshCw size={12} /> {followerRefreshBusy ? 'Triggering…' : 'Refresh now'}
                  </button>
                  <select value={followerCountProfile} onChange={e => setFollowerCountProfile(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">All profiles</option>
                    {igAccounts.map(u => <option key={u} value={u}>@{u}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <button onClick={() => setFollowerCountAgg('day')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${followerCountAgg === 'day' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      Daily
                    </button>
                    <button onClick={() => setFollowerCountAgg('month')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${followerCountAgg === 'month' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      Monthly
                    </button>
                  </div>
                </div>
              </div>
              {followerRefreshNote && (
                <div className="mb-3 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {followerRefreshNote}
                </div>
              )}
              <p className="text-xs text-gray-500 mb-3">
                The extension opens each of your profiles in a background tab once a day and records the follower count from Instagram's public profile page. Make sure <b>Automation</b> is enabled in the extension popup.
              </p>
              {followerCountSeries.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No follower counts recorded yet. The extension scrapes once every 24h — first counts appear after the first run.</p>
              ) : (
                <div className="space-y-4">
                  {followerCountSeries.map(series => (
                    <div key={series.my_profile} className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                        <a href={`https://instagram.com/${series.my_profile}`} target="_blank" rel="noreferrer"
                          className="text-sm font-medium text-blue-600 hover:underline">@{series.my_profile}</a>
                        <span className="text-sm text-gray-600">
                          Latest: <b className="text-gray-900">{(series.points[0]?.follower_count ?? 0).toLocaleString()}</b> followers
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 bg-white">
                            <th className="py-1.5 px-3 font-medium">{followerCountAgg === 'month' ? 'Month' : 'Date'}</th>
                            <th className="py-1.5 px-3 font-medium text-right">Followers</th>
                            <th className="py-1.5 px-3 font-medium text-right">Δ from previous</th>
                          </tr>
                        </thead>
                        <tbody>
                          {series.points.map(pt => (
                            <tr key={pt.bucket} className="border-t border-gray-100">
                              <td className="py-1.5 px-3 text-gray-600 text-xs">{pt.bucket}</td>
                              <td className="py-1.5 px-3 text-right">{pt.follower_count.toLocaleString()}</td>
                              <td className={`py-1.5 px-3 text-right text-xs ${
                                pt.delta == null ? 'text-gray-400'
                                : pt.delta > 0 ? 'text-green-600'
                                : pt.delta < 0 ? 'text-red-600'
                                : 'text-gray-500'
                              }`}>
                                {pt.delta == null ? '—' : pt.delta > 0 ? `+${pt.delta.toLocaleString()}` : pt.delta.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════ ACCOUNTS ══════════════════════════════ */}
        {tab === 'accounts' && (
          <div className="space-y-4 max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Plus size={18} /> Add an Instagram account</h3>
              <p className="text-sm text-gray-500 mb-3">
                Add the @handle of any Instagram account you manage. Or run <b>Scan accounts</b> from the extension popup on instagram.com to import all accounts logged into your browser at once.
              </p>
              <div className="flex gap-2">
                <input type="text" placeholder="@username" value={newAccount} onChange={e => setNewAccount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addAccount(); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <button onClick={addAccount}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Add</button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Your accounts <span className="text-gray-400 font-normal">({igAccounts.length})</span></h3>
              {igAccounts.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No accounts yet. Add one above or scan from the extension.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {igAccounts.map(u => (
                    <div key={u} className="flex items-center justify-between py-2.5">
                      <a href={`https://instagram.com/${u}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline">@{u}</a>
                      <button onClick={() => removeAccount(u)} className="text-gray-400 hover:text-red-500" title="Remove"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════ RESEARCH ══════════════════════════════ */}
        {tab === 'research' && !viewingUser && (
          <div className="space-y-4 max-w-4xl">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Search size={18} /> Scrape a profile</h3>
              <p className="text-sm text-gray-500 mb-4">
                Enter any public Instagram username — the extension will open the profile, scrape the first N posts (likes / views and comments), and save the data here.
                The extension must be installed on at least one device with <b>Automation</b> enabled.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                  <input type="text" placeholder="elizabethvasilenko" value={scrapeTarget}
                    onChange={e => setScrapeTarget(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createScrapeJob(); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Posts</label>
                  <input type="number" min={1} max={200} value={scrapeCount}
                    onChange={e => setScrapeCount(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <button onClick={createScrapeJob} disabled={scrapeBusy}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {scrapeBusy ? 'Queuing…' : 'Queue scrape'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Scrape jobs</h3>
                <button onClick={loadResearch} className="text-gray-400 hover:text-gray-600" title="Refresh">
                  <RefreshCw size={16} />
                </button>
              </div>
              {scrapeJobs.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No scrape jobs yet. Queue one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3 font-medium">Username</th>
                        <th className="py-2 pr-3 font-medium">Requested</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Scraped</th>
                        <th className="py-2 pr-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scrapeJobs.map(j => (
                        <tr key={j.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 font-medium text-blue-600">@{j.target_username}</td>
                          <td className="py-2 pr-3 text-gray-600">{j.post_count}</td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              j.status === 'completed' ? 'bg-green-100 text-green-700' :
                              j.status === 'running'   ? 'bg-blue-100 text-blue-700'   :
                              j.status === 'failed'    ? 'bg-red-100 text-red-700'     :
                                                         'bg-gray-100 text-gray-600'
                            }`}>{j.status}</span>
                            {j.status === 'failed' && j.error_message && (
                              <span className="block text-xs text-red-600 mt-0.5">{j.error_message}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">{j.posts_scraped || 0}</td>
                          <td className="py-2 pr-3 text-gray-500 text-xs">{fmt(j.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Scraped profiles <span className="text-gray-400 font-normal">({scrapedSummary.length})</span></h3>
              {scrapedSummary.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No data yet. Queue a scrape job above.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {scrapedSummary.map(s => (
                    <button key={s.target_username} onClick={() => openScrapedUser(s.target_username)}
                      className="w-full flex items-center justify-between py-2.5 hover:bg-gray-50 px-2 rounded">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-blue-600">@{s.target_username}</span>
                        <span className="text-xs text-gray-400">{s.post_count} posts</span>
                      </div>
                      <span className="text-xs text-gray-500">Last scraped {fmt(s.last_scraped_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'research' && viewingUser && (
          <div className="space-y-4 max-w-5xl">
            <div className="flex items-center justify-between">
              <button onClick={() => { setViewingUser(null); setViewingPosts([]); }}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                <ArrowLeft size={16} /> Back to research
              </button>
              <a href={`https://instagram.com/${viewingUser}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                @{viewingUser} <ExternalLink size={12} />
              </a>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Posts <span className="text-gray-400 font-normal">({viewingPosts.length})</span></h3>
                {selectedPosts.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{selectedPosts.size} selected</span>
                    <button onClick={() => setSelectedPosts(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
                    <button onClick={openAddToCampaign}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                      Add to campaign
                    </button>
                  </div>
                )}
              </div>
              {viewingPosts.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No posts found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3 font-medium w-8">
                          <input type="checkbox"
                            checked={selectedPosts.size === viewingPosts.length && viewingPosts.length > 0}
                            onChange={(e) => setSelectedPosts(e.target.checked ? new Set(viewingPosts.map(p => p.id)) : new Set())}
                          />
                        </th>
                        <th className="py-2 pr-3 font-medium">Post</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium text-right">Likes</th>
                        <th className="py-2 pr-3 font-medium text-right">Views</th>
                        <th className="py-2 pr-3 font-medium text-right">Comments</th>
                        <th className="py-2 pr-3 font-medium">Last scraped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingPosts.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3">
                            <input type="checkbox"
                              checked={selectedPosts.has(p.id)}
                              onChange={() => togglePostSelection(p.id)}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <a href={p.post_url} target="_blank" rel="noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1">
                              {p.shortcode} <ExternalLink size={12} />
                            </a>
                          </td>
                          <td className="py-2 pr-3 text-gray-600 capitalize">{p.post_type}</td>
                          <td className="py-2 pr-3 text-right">{p.likes != null ? p.likes.toLocaleString() : '—'}</td>
                          <td className="py-2 pr-3 text-right">{p.views != null ? p.views.toLocaleString() : '—'}</td>
                          <td className="py-2 pr-3 text-right">{p.comments != null ? p.comments.toLocaleString() : '—'}</td>
                          <td className="py-2 pr-3 text-gray-500 text-xs">{fmt(p.last_scraped_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════ HEALTH (admin) ══════════════════════════════ */}
        {tab === 'health' && isAdmin && (
          <div className="space-y-4 max-w-6xl">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Zap size={18} /> System Health</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Quick view of every Instagram feature. Click a card for the underlying page.</p>
                </div>
                <div className="flex items-center gap-2">
                  {health?.generated_at && (
                    <span className="text-xs text-gray-400">Updated {fmt(health.generated_at)}</span>
                  )}
                  <button onClick={loadHealth} disabled={healthBusy}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                    <RefreshCw size={12} /> {healthBusy ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {!health ? (
                <p className="text-gray-400 text-sm py-6 text-center">Loading health data…</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(() => {
                    const pillFor = (s: string) =>
                      s === 'ok'      ? 'bg-green-100 text-green-700' :
                      s === 'late'    ? 'bg-yellow-100 text-yellow-700' :
                      s === 'failing' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-500';
                    const dotFor = (s: string) =>
                      s === 'ok'      ? 'bg-green-500' :
                      s === 'late'    ? 'bg-yellow-500' :
                      s === 'failing' ? 'bg-red-500' :
                                        'bg-gray-400';
                    const Card = ({ title, status, primary, secondary, onClick, jumpTab }: {
                      title: string; status: string; primary: string; secondary?: string;
                      onClick?: () => void; jumpTab?: Tab;
                    }) => (
                      <div onClick={onClick || (jumpTab ? () => setTab(jumpTab) : undefined)}
                        className={`bg-white border border-gray-200 rounded-xl p-4 ${onClick || jumpTab ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''} transition-all`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${dotFor(status)}`} />
                            {title}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${pillFor(status)}`}>
                            {status}
                          </span>
                        </div>
                        <div className="text-xl font-bold text-gray-900">{primary}</div>
                        {secondary && <div className="text-xs text-gray-500 mt-1">{secondary}</div>}
                      </div>
                    );
                    const fc = health.follower_counts;
                    const sp = health.scheduled_posts;
                    const ab = health.action_batches;
                    const sj = health.scrape_jobs;
                    const ea = health.extension_activity;
                    const pp = health.permissions;
                    const ac = health.accounts;
                    const sumStatuses = (obj: Record<string, number>) => Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(' · ') || 'none';
                    return (
                      <>
                        <Card
                          title="Daily follower counts"
                          status={fc.status}
                          primary={`${fc.profiles_tracked} profile${fc.profiles_tracked === 1 ? '' : 's'}`}
                          secondary={fc.last_capture_at ? `Last captured ${fmt(fc.last_capture_at)}` : 'No data yet'}
                          jumpTab="followers"
                        />
                        <Card
                          title="Scheduled posts"
                          status={sp.status}
                          primary={sp.overdue > 0 ? `${sp.overdue} overdue` : `${(sp.by_status.scheduled || 0)} pending`}
                          secondary={sumStatuses(sp.by_status)}
                          jumpTab="schedule"
                        />
                        <Card
                          title="Action batches"
                          status={ab.status}
                          primary={`${(ab.by_status.running || 0)} running · ${(ab.by_status.pending || 0)} pending`}
                          secondary={ab.stalled_running > 0 ? `⚠️ ${ab.stalled_running} stuck >1h` : sumStatuses(ab.by_status)}
                          jumpTab="campaigns"
                        />
                        <Card
                          title="Scrape jobs"
                          status={sj.status}
                          primary={`${(sj.by_status.completed || 0)} completed`}
                          secondary={sj.stalled_running > 0 ? `⚠️ ${sj.stalled_running} stuck` : sumStatuses(sj.by_status)}
                          jumpTab="research"
                        />
                        <Card
                          title="Extension activity"
                          status={ea.status}
                          primary={`${ea.actions_last_24h} actions / 24h`}
                          secondary={ea.last_action_at ? `Last action ${fmt(ea.last_action_at)}` : 'No activity recorded'}
                          jumpTab="history"
                        />
                        <Card
                          title="Instagram accounts"
                          status={ac.status}
                          primary={`${ac.count} configured`}
                          secondary={ac.count > 0 ? 'Synced from the extension' : 'Scan accounts in the popup'}
                          jumpTab="accounts"
                        />
                        <Card
                          title="Per-user permissions"
                          status={pp.status}
                          primary={`${pp.users_with_explicit_perms} of ${pp.total_users} configured`}
                          secondary="Manage in User Management → permissions"
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ Create campaign modal ══ */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">New campaign</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                The campaign starts as a draft. Add up to 6 posts (from Research or by URL), then click <b>Send</b> to start it.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Instagram account</label>
                <select value={createAccount} onChange={e => setCreateAccount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">— pick one —</option>
                  {igAccounts.map(u => <option key={u} value={u}>@{u}</option>)}
                </select>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Free text (appended to the auto-generated name)</label>
                <input type="text" value={createFreeText} onChange={e => setCreateFreeText(e.target.value)}
                  placeholder="e.g. fashion influencers"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">
                  Name will be: <code className="bg-gray-100 px-1 rounded">@{createAccount || 'account'} {new Date().toLocaleDateString()} {new Date().toLocaleTimeString().slice(0,5)}{createFreeText ? ` — ${createFreeText}` : ''}</code>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Concurrency (1–6)</label>
                  <input type="number" min={1} max={6} value={createConcurrency}
                    onChange={e => setCreateConcurrency(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start at <span className="text-gray-400">(empty = ASAP after Send)</span></label>
                  <input type="datetime-local" value={createStartAt}
                    onChange={e => setCreateStartAt(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                <button onClick={createCampaign} disabled={createBusy}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {createBusy ? 'Creating…' : 'Create draft'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ Add-to-campaign modal (from Research) ══ */}
        {showAddToCampaign && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddToCampaign(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add to campaign</h3>
                <button onClick={() => setShowAddToCampaign(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Adding <b>{selectedPosts.size}</b> post{selectedPosts.size === 1 ? '' : 's'} to a campaign. Each campaign holds up to 6 posts total.
              </p>
              {actionCampaigns.filter(c => c.status !== 'completed' && c.status !== 'cancelled' && (c.items_count ?? 0) < 6).length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  No campaigns available. <button className="underline" onClick={() => { setShowAddToCampaign(false); setShowCreateModal(true); }}>Create one first</button>.
                </p>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
                    <select value={addToCampaignId} onChange={e => setAddToCampaignId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <option value="">— pick a campaign —</option>
                      {actionCampaigns
                        .filter(c => c.status !== 'completed' && c.status !== 'cancelled' && (c.items_count ?? 0) < 6)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.status} ({c.items_count ?? 0}/6, room for {6 - (c.items_count ?? 0)})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Action type</label>
                      <select value={addToActionType} onChange={e => setAddToActionType(e.target.value as 'like'|'reply')}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value="like">Like comments</option>
                        <option value="reply">Reply to comments</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Count per post</label>
                      <input type="number" min={1} max={100} value={addToCount}
                        onChange={e => setAddToCount(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  {addToActionType === 'reply' && (
                    <>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Reply text source</label>
                        <select value={addToReplySource} onChange={e => setAddToReplySource(e.target.value as 'default'|'custom'|'ai')}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                          <option value="default">Built-in defaults</option>
                          <option value="custom">Custom text</option>
                          <option value="ai">AI (Groq)</option>
                        </select>
                      </div>
                      {addToReplySource === 'custom' && (
                        <div className="mb-3">
                          <textarea value={addToReplyText} onChange={e => setAddToReplyText(e.target.value)}
                            placeholder="Amazing! 🔥&#10;Love this 😍"
                            rows={3}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="flex gap-2 justify-end mt-2">
                <button onClick={() => setShowAddToCampaign(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                <button onClick={submitAddToCampaign} disabled={addToBusy || !addToCampaignId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {addToBusy ? 'Adding…' : 'Add to campaign'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ CAMPAIGNS ══════════════════════════════ */}
        {tab === 'campaigns' && (
          <div className="space-y-3">

            {/* Action campaigns header + create button */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Action campaigns <span className="text-gray-400 font-normal">({actionCampaigns.length})</span></h3>
                <div className="flex items-center gap-2">
                  <button onClick={loadActionCampaigns} className="text-gray-400 hover:text-gray-600" title="Refresh">
                    <RefreshCw size={16} />
                  </button>
                  <button onClick={() => { setCreateAccount(igAccounts[0] || ''); setShowCreateModal(true); }}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1">
                    <Plus size={14} /> New campaign
                  </button>
                </div>
              </div>
              {actionCampaigns.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No campaigns yet. Click <b>+ New campaign</b> to create your first one.</p>
              ) : (
                <div className="space-y-2">
                  {actionCampaigns.map(c => {
                    const elapsedMs = c.started_at && c.ended_at
                      ? new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()
                      : c.started_at ? Date.now() - new Date(c.started_at).getTime() : 0;
                    const minutes = Math.max(0, Math.round(elapsedMs / 60000));
                    const pct = c.total_requested > 0 ? Math.round((c.total_completed / c.total_requested) * 100) : 0;
                    const isExpanded = expandedCampaign === c.id;
                    return (
                      <div key={c.id} className="border border-gray-100 rounded-lg">
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <button onClick={() => {
                              if (isExpanded) { setExpandedCampaign(null); }
                              else { setExpandedCampaign(c.id); loadExpandedItems(c.id); }
                            }} className="flex items-center gap-2 text-left flex-1">
                              <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              <span className="font-medium text-gray-900 text-sm">{c.name || `Campaign ${c.id.slice(0, 8)}`}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                c.status === 'draft'     ? 'bg-amber-100 text-amber-700'  :
                                c.status === 'completed' ? 'bg-green-100 text-green-700'  :
                                c.status === 'running'   ? 'bg-blue-100 text-blue-700'    :
                                c.status === 'paused'    ? 'bg-yellow-100 text-yellow-700':
                                c.status === 'cancelled' ? 'bg-gray-100 text-gray-600'    :
                                c.status === 'failed'    ? 'bg-red-100 text-red-700'      :
                                                           'bg-gray-100 text-gray-600'
                              }`}>{c.status}</span>
                              <span className="text-xs text-gray-500">{c.items_count ?? 0}/6 posts</span>
                            </button>
                            <div className="flex items-center gap-2">
                              {c.status === 'draft' && (
                                <button onClick={() => sendCampaign(c.id)}
                                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Send</button>
                              )}
                              {(c.status === 'running' || c.status === 'pending') && (
                                <button onClick={() => cancelActionCampaign(c.id)}
                                  className="text-xs text-red-600 hover:text-red-800">Cancel</button>
                              )}
                              {(c.status === 'paused' || c.status === 'failed') && (
                                <button onClick={() => resumeActionCampaign(c.id)}
                                  className="text-xs text-blue-600 hover:text-blue-800">Resume</button>
                              )}
                              <button onClick={() => deleteCampaign(c.id)} title="Delete"
                                className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                          </div>
                          {c.status !== 'draft' && (
                            <>
                              <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-2 pl-6">
                                <span><b className="text-gray-900">{c.total_completed}</b> / {c.total_requested} actions</span>
                                {c.as_account && <span>@{c.as_account}</span>}
                                <span>Concurrency: {c.concurrency}</span>
                                {c.start_at && !c.started_at && <span className="text-amber-600">Scheduled: {fmt(c.start_at)}</span>}
                                {c.started_at && <span>Started: {fmt(c.started_at)}</span>}
                                {c.ended_at && <span>Ended: {fmt(c.ended_at)}</span>}
                                {c.started_at && <span>Elapsed: {minutes} min</span>}
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden ml-6" style={{width: 'calc(100% - 1.5rem)'}}>
                                <div className={`h-full ${c.status === 'paused' || c.status === 'failed' ? 'bg-red-400' : c.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          )}
                          {c.error_message && <p className="text-xs text-red-600 mt-2 pl-6">{c.error_message}</p>}
                        </div>

                        {/* Expanded detail view */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 p-3 bg-gray-50">
                            {/* Scheduled start time — editable while draft or pending */}
                            {(c.status === 'draft' || c.status === 'pending') && (
                              <div className="flex items-center gap-2 mb-3 text-xs">
                                <label className="text-gray-600 whitespace-nowrap">Scheduled start:</label>
                                <input type="datetime-local"
                                  defaultValue={c.start_at ? new Date(c.start_at).toISOString().slice(0, 16) : ''}
                                  onBlur={(e) => {
                                    const next = e.target.value;
                                    const curr = c.start_at ? new Date(c.start_at).toISOString().slice(0, 16) : '';
                                    if (next !== curr) patchCampaignStartAt(c.id, next);
                                  }}
                                  className="border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                                <span className="text-gray-400">(leave empty for ASAP after Send)</span>
                              </div>
                            )}
                            {expandedItems.length === 0 ? (
                              <p className="text-xs text-gray-500 py-2">No posts yet. Add one below.</p>
                            ) : (
                              <table className="w-full text-sm mb-3">
                                <thead>
                                  <tr className="text-left text-xs text-gray-500">
                                    <th className="py-1 pr-2 font-medium">Post</th>
                                    <th className="py-1 pr-2 font-medium">Action</th>
                                    <th className="py-1 pr-2 font-medium w-20">Count</th>
                                    <th className="py-1 pr-2 font-medium">Status</th>
                                    <th className="py-1 pr-2 font-medium w-8"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedItems.map(it => (
                                    <tr key={it.id} className="border-t border-gray-200">
                                      <td className="py-1.5 pr-2">
                                        <a href={it.post_url} target="_blank" rel="noreferrer"
                                          className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                          {it.post_url.match(/\/(p|reel)\/([\w-]+)/)?.[2] || it.post_url.slice(-15)}
                                          <ExternalLink size={10} />
                                        </a>
                                      </td>
                                      <td className="py-1.5 pr-2 text-gray-600 capitalize text-xs">{it.action_type}</td>
                                      <td className="py-1.5 pr-2">
                                        {it.status === 'pending' ? (
                                          <input type="number" min={1} max={100} defaultValue={it.count_requested}
                                            onBlur={e => {
                                              const v = parseInt(e.target.value, 10);
                                              if (v !== it.count_requested && v >= 1) patchItemCount(c.id, it.id, v);
                                            }}
                                            className="w-16 border border-gray-200 rounded px-1 py-0.5 text-xs bg-white" />
                                        ) : (
                                          <span className="text-xs text-gray-600">{it.count_done}/{it.count_requested}</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                          it.status === 'completed' ? 'bg-green-100 text-green-700' :
                                          it.status === 'running'   ? 'bg-blue-100 text-blue-700'   :
                                          it.status === 'claimed'   ? 'bg-blue-50 text-blue-600'    :
                                          it.status === 'failed'    ? 'bg-red-100 text-red-700'     :
                                          it.status === 'cancelled' ? 'bg-gray-100 text-gray-600'   :
                                                                      'bg-amber-100 text-amber-700'
                                        }`}>{it.status}</span>
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        {it.status === 'pending' && (
                                          <button onClick={() => removeItem(c.id, it.id)} title="Remove"
                                            className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            {/* Add by URL form */}
                            {c.status !== 'completed' && c.status !== 'cancelled' && (c.items_count ?? 0) < 6 && (
                              <div className="border-t border-gray-200 pt-3">
                                <p className="text-xs font-medium text-gray-700 mb-2">+ Add post by URL ({6 - (c.items_count ?? 0)} slot{6 - (c.items_count ?? 0) === 1 ? '' : 's'} left)</p>
                                <div className="flex flex-wrap gap-2 items-end">
                                  <input type="text" placeholder="https://www.instagram.com/p/SHORTCODE/"
                                    value={byUrlInput} onChange={e => setByUrlInput(e.target.value)}
                                    className="flex-1 min-w-[200px] border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
                                  <select value={byUrlActionType} onChange={e => setByUrlActionType(e.target.value as 'like'|'reply')}
                                    className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                                    <option value="like">Like</option>
                                    <option value="reply">Reply</option>
                                  </select>
                                  <input type="number" min={1} max={100} value={byUrlCount}
                                    onChange={e => setByUrlCount(e.target.value)}
                                    className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
                                  <button onClick={() => addByUrl(c.id)} disabled={byUrlBusy}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                                    {byUrlBusy ? 'Adding…' : 'Add'}
                                  </button>
                                </div>
                                {byUrlActionType === 'reply' && (
                                  <div className="mt-2 flex gap-2">
                                    <select value={byUrlReplySource} onChange={e => setByUrlReplySource(e.target.value as 'default'|'custom'|'ai')}
                                      className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                                      <option value="default">Default replies</option>
                                      <option value="custom">Custom text</option>
                                      <option value="ai">AI (Groq)</option>
                                    </select>
                                    {byUrlReplySource === 'custom' && (
                                      <input type="text" placeholder="Amazing!, Love this 😍, So true"
                                        value={byUrlReplyText} onChange={e => setByUrlReplyText(e.target.value)}
                                        className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {campaigns.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 capitalize">{TYPE_LABEL[c.type] || c.type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-400">{fmt(c.started_at)}</span>
                </div>
                <div className="flex gap-6 text-sm">
                  <div><span className="text-gray-500">Actions:</span> <span className="font-semibold">{c.actions_count}</span></div>
                  <div><span className="text-gray-500">New followers:</span> <span className="font-semibold text-green-600">+{c.new_followers}</span></div>
                  {c.ended_at && <div><span className="text-gray-500">Ended:</span> <span className="font-semibold">{fmt(c.ended_at)}</span></div>}
                  {c.ended_at && c.started_at && (
                    <div>
                      <span className="text-gray-500">Duration:</span>{' '}
                      <span className="font-semibold">
                        {Math.round((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 60000)} min
                      </span>
                    </div>
                  )}
                </div>
                {c.notes && <p className="text-sm text-gray-500 mt-2">{c.notes}</p>}
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No campaigns yet. Run the extension to start tracking.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════ EDIT SCHEDULED POST MODAL ══════════════════════════════ */}
      {editingPost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingPost(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-900">Edit scheduled post</h3>
              <button onClick={() => setEditingPost(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="text-gray-600">Replace media (optional)</span>
                <input type="file" accept="image/*,video/*" onChange={e => setEditFile(e.target.files?.[0] || null)}
                  className="block w-full mt-1 text-sm" />
                {editFile ? (
                  <span className="text-xs text-blue-600">New file selected: {editFile.name}</span>
                ) : (
                  <span className="text-xs text-gray-500">Current: {editingPost.media_filename}</span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="text-gray-600">Post type</span>
                  <select value={editType} onChange={e => setEditType(e.target.value as 'post' | 'story' | 'reel')}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm">
                    <option value="post">Post</option>
                    <option value="story">Story</option>
                    <option value="reel">Reel</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">Publish at</span>
                  <input type="datetime-local" value={editWhen} onChange={e => setEditWhen(e.target.value)}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-gray-600">Instagram account</span>
                {igAccounts.length > 0 ? (
                  <select value={editProfile} onChange={e => setEditProfile(e.target.value)}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm">
                    <option value="">— Any / current —</option>
                    {igAccounts.map(a => <option key={a} value={a}>@{a}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="@myhandle" value={editProfile} onChange={e => setEditProfile(e.target.value)}
                    className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                )}
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Caption</span>
                <textarea rows={4} value={editCaption} onChange={e => setEditCaption(e.target.value)}
                  className="block w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm" />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingPost(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
