import { useEffect, useState } from 'react';
import { Users, TrendingUp, FormInput, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
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

  // Last 7 days total
  const last7 = report?.overTime.slice(-7).reduce((s, d) => s + d.count, 0) ?? 0;

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
        <StatCard icon={<Users size={18} />}         label="Total Contacts" value={report?.total ?? '—'} sub="all time" />
        <StatCard icon={<TrendingUp size={18} />}    label="Added (last 7d)" value={last7} sub="new contacts" />
        <StatCard icon={<FormInput size={18} />}     label="From Forms" value={formContacts} sub={`${manualContacts} manual`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Line chart — over time */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Contacts over time (last 30 days)</h3>
          {reportLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={report?.overTime ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Contacts']}
                  labelFormatter={l => new Date(l).toLocaleDateString()} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie — by source */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Source breakdown</h3>
          {(report?.bySource ?? []).length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={report?.bySource ?? []} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                  dataKey="count" nameKey="label" paddingAngle={3}>
                  {(report?.bySource ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, 'Contacts']} />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={report?.byValue ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'Contacts']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {(report?.byValue ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
