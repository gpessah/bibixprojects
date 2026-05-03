import { useEffect, useState } from 'react';
import { Users, TrendingUp, FormInput, RefreshCw } from 'lucide-react';
import { useCRMStore } from '../../store/crmStore';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">{icon}</div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function ReportsPanel() {
  const { fields, report, reportLoading, loadReport } = useCRMStore();
  const [groupBy, setGroupBy] = useState('');
  const selectFields = fields.filter(f => f.type === 'select');

  useEffect(() => {
    loadReport({ groupBy: groupBy || undefined });
  }, [groupBy]);

  const formContacts = report?.bySource.find(s => s.label === 'Form')?.count ?? 0;
  const manualContacts = report?.bySource.find(s => s.label === 'Manual')?.count ?? 0;
  const last7 = report?.overTime.slice(-7).reduce((s, d) => s + d.count, 0) ?? 0;
  const maxOverTime = Math.max(...(report?.overTime ?? []).map(d => d.count), 1);
  const maxByValue = Math.max(...(report?.byValue ?? []).map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Reports</h2>
        <button onClick={() => loadReport({ groupBy: groupBy || undefined })}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100">
          <RefreshCw size={14} className={reportLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Users size={18} />}      label="Total Contacts"  value={report?.total ?? '—'}  sub="all time" />
        <StatCard icon={<TrendingUp size={18} />} label="Added (last 7d)" value={last7}                  sub="new contacts" />
        <StatCard icon={<FormInput size={18} />}  label="From Forms"      value={formContacts}           sub={`${manualContacts} manual`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Line chart — over time (CSS bars) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Contacts over time (last 30 days)</h3>
          {reportLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : (report?.overTime ?? []).length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <div className="flex items-end gap-0.5 h-40">
              {(report?.overTime ?? []).slice(-30).map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="relative w-full">
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                      style={{ height: `${Math.max(4, (d.count / maxOverTime) * 140)}px` }}
                      title={`${d.date}: ${d.count}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Source breakdown</h3>
          {(report?.bySource ?? []).length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <div className="space-y-3 mt-2">
              {(report?.bySource ?? []).map((s, i) => {
                const total = (report?.bySource ?? []).reduce((a, b) => a + b.count, 0);
                const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                return (
                  <div key={s.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{s.label}</span>
                      <span className="text-gray-500">{s.count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bar chart — group by field */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Breakdown by field</h3>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— select field —</option>
            {selectFields.map(f => <option key={f.id} value={f.field_key}>{f.name}</option>)}
          </select>
        </div>
        {!groupBy ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            Select a field above to see the breakdown
          </div>
        ) : reportLoading ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : (report?.byValue ?? []).length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this field</div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {(report?.byValue ?? []).map((d, i) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-gray-700">{d.count}</span>
                <div
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(4, (d.count / maxByValue) * 120)}px`, background: COLORS[i % COLORS.length] }}
                  title={`${d.label}: ${d.count}`}
                />
                <span className="text-xs text-gray-500 truncate w-full text-center">{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
