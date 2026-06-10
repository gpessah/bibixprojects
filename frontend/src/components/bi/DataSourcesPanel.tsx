import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Link2, Unlink, Table2, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import biApi, { BiDatasource } from '../../api/bi';
import { useBiStore } from '../../store/biStore';

function timeAgo(iso?: string | null) {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DataSourcesPanel() {
  const { connections, datasources, loadConnections, loadDatasources } = useBiStore();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { loadConnections(); loadDatasources(); }, []);

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

  return (
    <div className="p-6 space-y-6">
      {/* Connections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Google accounts</h2>
          <button onClick={connect} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><Link2 size={14} /> Connect Google</button>
        </div>
        {connections.length === 0
          ? <p className="text-sm text-gray-400">No Google account connected yet. Connect one to pull in spreadsheets.</p>
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
          <h2 className="text-sm font-semibold text-gray-700">Connected sheets</h2>
          <button onClick={() => setShowAdd(true)} disabled={!connections.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"><Plus size={14} /> Add sheet</button>
        </div>
        {datasources.length === 0
          ? <p className="text-sm text-gray-400">No data sources. Add a sheet to start building reports.</p>
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

      {showAdd && <AddSheetModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadDatasources(); }} />}
    </div>
  );
}

function AddSheetModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { connections } = useBiStore();
  const [connId, setConnId] = useState(connections[0]?.id || '');
  const [sheets, setSheets] = useState<any[]>([]);
  const [sheetId, setSheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [tabs, setTabs] = useState<any[]>([]);
  const [tab, setTab] = useState('');
  const [range, setRange] = useState('');
  const [interval, setInterval] = useState(60);
  const [name, setName] = useState('');
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!connId) return;
    setLoadingSheets(true);
    biApi.listSpreadsheets(connId).then(setSheets).catch((e) => toast.error(e?.response?.data?.error || 'Failed to list sheets')).finally(() => setLoadingSheets(false));
  }, [connId]);

  const pickSheet = async (id: string) => {
    setSheetId(id);
    const s = sheets.find((x) => x.id === id); setSheetName(s?.name || ''); setName(s?.name || '');
    try { const info = await biApi.listTabs(connId, id); setTabs(info.tabs || []); setTab(info.tabs?.[0]?.title || ''); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Failed to read tabs'); }
  };

  const save = async () => {
    if (!sheetId) return toast.error('Pick a spreadsheet');
    setSaving(true);
    try {
      const ds: BiDatasource = await biApi.createDatasource({
        connection_id: connId, name, spreadsheet_id: sheetId, spreadsheet_name: sheetName,
        sheet_name: tab || null, cell_range: range || null, refresh_interval_minutes: interval,
      });
      if (ds.last_error) toast.error(`Added, but sync failed: ${ds.last_error}`);
      else toast.success(`Added — ${ds.row_count} rows synced`);
      onAdded();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const lbl = 'block text-xs font-medium text-gray-500 mb-1';
  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';

  return (
    <Modal title="Add a Google Sheet" onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        <div>
          <label className={lbl}>Google account</label>
          <select className={inp} value={connId} onChange={(e) => setConnId(e.target.value)}>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.google_email}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Spreadsheet {loadingSheets && <span className="text-gray-400">(loading…)</span>}</label>
          <select className={inp} value={sheetId} onChange={(e) => pickSheet(e.target.value)}>
            <option value="">— select —</option>
            {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {tabs.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Tab</label>
              <select className={inp} value={tab} onChange={(e) => setTab(e.target.value)}>
                {tabs.map((t) => <option key={t.title} value={t.title}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Range (optional)</label>
              <input className={inp} placeholder="A1:F1000" value={range} onChange={(e) => setRange(e.target.value)} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Name</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className={lbl}>Auto-refresh (minutes)</label><input className={inp} type="number" min={0} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></div>
        </div>
        <p className="text-xs text-gray-400">The first row of the sheet/range is treated as column headers.</p>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={save} disabled={saving || !sheetId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add & sync'}</button>
      </div>
    </Modal>
  );
}
