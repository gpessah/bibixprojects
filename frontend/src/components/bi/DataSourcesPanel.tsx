import { useEffect, useState, useRef } from 'react';
import {
  Plus, RefreshCw, Trash2, Link2, Unlink, Table2, AlertCircle, CheckCircle2,
  Upload, Folder, FileSpreadsheet, ChevronRight, ArrowLeft, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import biApi, { BiDatasource, BiCombined } from '../../api/bi';
import { useBiStore } from '../../store/biStore';
import CombinedBuilder from './CombinedBuilder';

function timeAgo(iso?: string | null) {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DataSourcesPanel() {
  const { connections, datasources, combined, loadConnections, loadDatasources, loadManual, loadCombined } = useBiStore();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCombine, setShowCombine] = useState<BiCombined | true | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { loadConnections(); loadDatasources(); loadManual(); loadCombined(); }, []);

  const removeCombined = async (id: string) => {
    if (!confirm('Delete this combined dataset?')) return;
    await biApi.deleteCombined(id); await loadCombined(); toast.success('Deleted');
  };

  const connect = async () => {
    try { window.location.href = await biApi.googleAuthUrl(); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Google not configured'); }
  };

  const refresh = async (id: string) => {
    setBusy(id);
    try { const r = await biApi.refreshDatasource(id); toast.success(`Synced ${r.rowCount} rows`); await loadDatasources(); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this data source? Widgets using it will stop loading.')) return;
    await biApi.deleteDatasource(id); await loadDatasources(); toast.success('Deleted');
  };

  const disconnect = async (id: string) => {
    if (!confirm('Disconnect this Google account?')) return;
    await biApi.deleteConnection(id); await loadConnections(); await loadDatasources();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await biApi.uploadFile(file);
      await loadManual();
      toast.success(`Uploaded "${r.dataset.name}" — ${r.rowCount} rows. Find it under Manual Data or pick it as a widget source.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Connections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Google accounts</h2>
          <button onClick={connect} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><Link2 size={14} /> Connect Google</button>
        </div>
        {connections.length === 0
          ? <p className="text-sm text-gray-400">No Google account connected yet. Connect one to pull in spreadsheets and files from Drive.</p>
          : <div className="flex flex-wrap gap-2">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm">
                  <CheckCircle2 size={14} className="text-green-500" /> {c.google_email}
                  <button onClick={() => disconnect(c.id)} className="text-gray-400 hover:text-red-500"><Unlink size={13} /></button>
                </div>
              ))}
            </div>}
      </div>

      {/* Datasources */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Connected files</h2>
          <div className="flex gap-2">
            <input ref={fileInput} type="file" accept=".csv,.tsv,.xlsx,.xls,.ods" className="hidden" onChange={onUpload} />
            <button onClick={() => fileInput.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload from PC'}
            </button>
            <button onClick={() => setShowAdd(true)} disabled={!connections.length}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"><Plus size={14} /> Add from Drive</button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">Supports Google Sheets, Excel (.xlsx/.xls), CSV, TSV and ODS — from Drive or your computer.</p>
        {datasources.length === 0
          ? <p className="text-sm text-gray-400">No data sources yet. Add a file from Drive, or upload one from your computer.</p>
          : <div className="space-y-2">
              {datasources.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                  <Table2 size={18} className="text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{d.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {d.spreadsheet_name}{d.sheet_name ? ` › ${d.sheet_name}` : ''} · {d.row_count} rows · synced {timeAgo(d.last_synced_at)} · every {d.refresh_interval_minutes}m
                    </div>
                    {d.last_error && <div className="text-xs text-red-500 flex items-center gap-1 mt-0.5"><AlertCircle size={12} /> {d.last_error}</div>}
                  </div>
                  <button onClick={() => refresh(d.id)} disabled={busy === d.id} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><RefreshCw size={15} className={busy === d.id ? 'animate-spin' : ''} /></button>
                  <button onClick={() => remove(d.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>}
      </div>

      {/* Combined datasets (joins) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Combined datasets (joins)</h2>
          <button onClick={() => setShowCombine(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><Link2 size={14} /> Combine tables</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">Join two or more tables on a shared key (e.g. clientID) into one dataset you can chart or measure.</p>
        {combined.length === 0
          ? <p className="text-sm text-gray-400">No combined datasets yet.</p>
          : <div className="space-y-2">
              {combined.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                  <Link2 size={18} className="text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                    <div className="text-xs text-gray-400 truncate">{(c.definition?.joins?.length || 0) + 1} tables · {c.columns.length} columns</div>
                  </div>
                  <button onClick={() => setShowCombine(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Plus size={15} className="rotate-45" /></button>
                  <button onClick={() => removeCombined(c.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>}
      </div>

      {showAdd && <AddFileModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadDatasources(); }} />}
      {showCombine && <CombinedBuilder existing={showCombine === true ? undefined : showCombine} onClose={() => setShowCombine(null)} onSaved={() => { setShowCombine(null); loadCombined(); }} />}
    </div>
  );
}

// ── Drive file picker (folder navigation + multi-format) ───────────────────────
function AddFileModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { connections } = useBiStore();
  const [connId, setConnId] = useState(connections[0]?.id || '');
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }]);
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<any>(null);

  // selected-file config
  const [tabs, setTabs] = useState<string[]>([]);
  const [tab, setTab] = useState('');
  const [range, setRange] = useState('');
  const [interval, setInterval] = useState(60);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const cur = path[path.length - 1];

  const browse = async (folderId: string, q?: string) => {
    if (!connId) return;
    setLoading(true);
    try {
      const r = await biApi.browseDrive(connId, q ? undefined : folderId, q || undefined);
      setFolders(r.folders || []); setFiles(r.files || []);
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed to read Drive'); }
    finally { setLoading(false); }
  };

  useEffect(() => { setPicked(null); browse(cur.id); }, [connId, path]);

  const openFolder = (f: any) => { setSearch(''); setPath((p) => [...p, { id: f.id, name: f.name }]); };
  const crumbTo = (i: number) => setPath((p) => p.slice(0, i + 1));
  const doSearch = () => { if (search.trim()) browse('', search.trim()); else browse(cur.id); };

  const pickFile = async (f: any) => {
    setPicked(f); setName(f.name.replace(/\.(csv|tsv|xlsx|xls|ods)$/i, '')); setTab(''); setTabs([]); setRange('');
    if (f.mimeType === biApi.GSHEET_MIME) {
      try { const info = await biApi.listTabs(connId, f.id); setTabs((info.tabs || []).map((t: any) => t.title)); setTab(info.tabs?.[0]?.title || ''); } catch {}
    } else if (/\.(xlsx|xls|ods)$/i.test(f.name) || f.mimeType.includes('spreadsheetml') || f.mimeType.includes('ms-excel') || f.mimeType.includes('opendocument')) {
      try { const info = await biApi.listFileSheets(connId, f.id); setTabs(info.sheets || []); setTab(info.sheets?.[0] || ''); } catch {}
    }
  };

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const ds: BiDatasource = await biApi.createDatasource({
        connection_id: connId, name, spreadsheet_id: picked.id, spreadsheet_name: picked.name,
        sheet_name: tab || null, cell_range: range || null, refresh_interval_minutes: interval, mime_type: picked.mimeType,
      });
      if (ds.last_error) toast.error(`Added, but sync failed: ${ds.last_error}`);
      else toast.success(`Added — ${ds.row_count} rows synced`);
      onAdded();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  const lbl = 'block text-xs font-medium text-gray-500 mb-1';
  const isSheet = picked && picked.mimeType === biApi.GSHEET_MIME;
  const isExcel = picked && (/\.(xlsx|xls|ods)$/i.test(picked.name) || tabs.length > 0) && !isSheet;

  return (
    <Modal title="Add a file from Google Drive" onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        {connections.length > 1 && (
          <div>
            <label className={lbl}>Google account</label>
            <select className={inp} value={connId} onChange={(e) => { setConnId(e.target.value); setPath([{ id: 'root', name: 'My Drive' }]); }}>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.google_email}</option>)}
            </select>
          </div>
        )}

        {/* search + breadcrumb */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-1 border border-gray-300 rounded-lg px-2">
            <Search size={14} className="text-gray-400" />
            <input className="flex-1 py-1.5 text-sm focus:outline-none" placeholder="Search all of Drive…" value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          </div>
          <button onClick={doSearch} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Search</button>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 flex-wrap">
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              <button onClick={() => crumbTo(i)} className="hover:text-blue-600">{p.name}</button>
            </span>
          ))}
        </div>

        {/* browser */}
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
          {loading && <div className="p-4 text-center text-sm text-gray-400">Loading…</div>}
          {!loading && !folders.length && !files.length && <div className="p-4 text-center text-sm text-gray-400">Empty folder — no supported files here.</div>}
          {folders.map((f) => (
            <button key={f.id} onClick={() => openFolder(f)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left">
              <Folder size={15} className="text-amber-500" /> <span className="flex-1 truncate">{f.name}</span> <ChevronRight size={14} className="text-gray-300" />
            </button>
          ))}
          {files.map((f) => (
            <button key={f.id} onClick={() => pickFile(f)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50 text-left ${picked?.id === f.id ? 'bg-blue-50' : ''}`}>
              <FileSpreadsheet size={15} className={f.mimeType === biApi.GSHEET_MIME ? 'text-green-600' : 'text-blue-500'} />
              <span className="flex-1 truncate">{f.name}</span>
              {picked?.id === f.id && <CheckCircle2 size={14} className="text-blue-600" />}
            </button>
          ))}
        </div>

        {/* selected-file config */}
        {picked && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="text-sm text-gray-700">Selected: <span className="font-medium">{picked.name}</span></div>
            {(isSheet || isExcel) && tabs.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>{isSheet ? 'Tab' : 'Sheet'}</label>
                  <select className={inp} value={tab} onChange={(e) => setTab(e.target.value)}>
                    {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {isSheet && <div><label className={lbl}>Range (optional)</label><input className={inp} placeholder="A1:F1000" value={range} onChange={(e) => setRange(e.target.value)} /></div>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Name</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className={lbl}>Auto-refresh (minutes)</label><input className={inp} type="number" min={0} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></div>
            </div>
            <p className="text-xs text-gray-400">The first row is treated as column headers.</p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={save} disabled={saving || !picked} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add & sync'}</button>
      </div>
    </Modal>
  );
}
