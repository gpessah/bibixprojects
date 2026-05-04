import { useEffect, useState } from 'react';
import { Database, RefreshCw, RotateCcw, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../api/client';
import toast from 'react-hot-toast';

const SECRET = 'bibix-setup-2026';

interface Backup {
  file: string;
  size: number;
  mtime: string;
}

interface RestoreLog {
  timestamp: string;
  action: string;
  file?: string;
  status: 'success' | 'error';
  message: string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function backupType(file: string) {
  if (file.includes('.daily.')) return { label: 'Daily', color: 'bg-blue-100 text-blue-700' };
  if (file.includes('.weekly.')) return { label: 'Weekly', color: 'bg-purple-100 text-purple-700' };
  if (file.includes('.startup.')) return { label: 'Startup', color: 'bg-gray-100 text-gray-600' };
  if (file.includes('.manual-')) return { label: 'Manual', color: 'bg-green-100 text-green-700' };
  if (file.includes('.pre-restore-')) return { label: 'Pre-Restore', color: 'bg-orange-100 text-orange-700' };
  return { label: 'Backup', color: 'bg-gray-100 text-gray-600' };
}

export default function BackupsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const [backups, setBackups] = useState<Backup[]>([]);
  const [logs, setLogs] = useState<RestoreLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [tab, setTab] = useState<'backups' | 'logs'>('backups');

  const loadBackups = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/auth/db-backup?secret=${SECRET}`);
      setBackups(data.backups || []);
    } catch {
      toast.error('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const createManualBackup = async () => {
    try {
      const { data } = await api.post(`/auth/db-backup?secret=${SECRET}`);
      toast.success(`Manual backup created: ${data.file}`);
      addLog({ action: 'Manual backup created', file: data.file, status: 'success', message: `Size: ${fmtSize(data.size)}` });
      loadBackups();
    } catch (e: any) {
      toast.error('Backup failed');
      addLog({ action: 'Manual backup failed', status: 'error', message: e.message });
    }
  };

  const restoreBackup = async (file: string) => {
    if (!confirm(`Restore from "${file}"?\n\nThe current database will be saved as a pre-restore backup. The app will need to restart after restore.`)) return;
    setRestoring(file);
    try {
      const { data } = await api.post(`/auth/db-restore?secret=${SECRET}&file=${encodeURIComponent(file)}`);
      toast.success('Restored! Restart the backend to apply.');
      addLog({ action: 'Database restored', file, status: 'success', message: data.message });
      loadBackups();
    } catch (e: any) {
      toast.error('Restore failed');
      addLog({ action: 'Restore failed', file, status: 'error', message: e.message });
    } finally {
      setRestoring(null);
    }
  };

  const addLog = (entry: Omit<RestoreLog, 'timestamp'>) => {
    const log: RestoreLog = { ...entry, timestamp: new Date().toISOString() };
    setLogs(prev => [log, ...prev]);
    // Persist logs to localStorage
    const stored = JSON.parse(localStorage.getItem('backup_logs') || '[]');
    localStorage.setItem('backup_logs', JSON.stringify([log, ...stored].slice(0, 100)));
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadBackups();
    // Load persisted logs
    const stored = JSON.parse(localStorage.getItem('backup_logs') || '[]');
    setLogs(stored);
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Super Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Database size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Database Backups</h1>
              <p className="text-sm text-gray-500">Manage and restore database backups</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadBackups} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={createManualBackup} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              <Database size={14} /> Create Backup Now
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {(['backups', 'logs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'backups' ? `Backups (${backups.length})` : `Restore Logs (${logs.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'backups' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : backups.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Database size={32} className="mx-auto mb-3 text-gray-300" />
                <p>No backups yet. Create one now or wait for the daily cron job.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">File</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Size</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Created</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => {
                    const type = backupType(b.file);
                    return (
                      <tr key={b.file} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600 max-w-xs truncate">{b.file}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${type.color}`}>{type.label}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{fmtSize(b.size)}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(b.mtime)}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => restoreBackup(b.file)}
                            disabled={restoring === b.file}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-lg border border-orange-200 ml-auto disabled:opacity-50">
                            <RotateCcw size={12} className={restoring === b.file ? 'animate-spin' : ''} />
                            {restoring === b.file ? 'Restoring…' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
                <CheckCircle size={32} className="mx-auto mb-3 text-gray-300" />
                <p>No restore activity yet</p>
              </div>
            ) : logs.map((log, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
                {log.status === 'success'
                  ? <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">{log.action}</span>
                    <span className="text-xs text-gray-400">{fmtDate(log.timestamp)}</span>
                  </div>
                  {log.file && <div className="text-xs font-mono text-gray-500 mt-0.5">{log.file}</div>}
                  <div className="text-sm text-gray-500 mt-1">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
