import { useEffect, useState } from 'react';
import { Plus, Trash2, Sigma } from 'lucide-react';
import toast from 'react-hot-toast';
import biApi from '../../api/bi';
import { useBiStore } from '../../store/biStore';

export default function MetricsPanel() {
  const { metrics, loadMetrics } = useBiStore();
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => { loadMetrics(); }, []);

  const add = async () => {
    if (!name.trim() || !expression.trim()) return toast.error('Name and expression required');
    try {
      await biApi.createMetric({ name: name.trim(), expression: expression.trim(), description });
      setName(''); setExpression(''); setDescription(''); await loadMetrics(); toast.success('Metric saved');
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
  };
  const remove = async (id: string) => { await biApi.deleteMetric(id); await loadMetrics(); };

  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';

  return (
    <div className="p-6 max-w-3xl">
      <p className="text-sm text-gray-500 mb-4">Named formulas you can reuse across widgets. Reference other metrics by name, e.g. <code className="bg-gray-100 px-1 rounded">Margin = (Revenue - Cost) / Revenue * 100</code>. They become available as variables when building a widget.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Margin" /></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Expression</label><input className={`${inp} font-mono`} value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="(Revenue - Cost) / Revenue * 100" /></div>
        </div>
        <input className={`${inp} mb-3`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={14} /> Add metric</button>
      </div>

      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg">
            <Sigma size={16} className="text-purple-500" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{m.name}</div>
              <code className="text-xs text-gray-500">{m.expression}</code>
              {m.description && <div className="text-xs text-gray-400">{m.description}</div>}
            </div>
            <button onClick={() => remove(m.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
          </div>
        ))}
        {!metrics.length && <p className="text-sm text-gray-400">No metrics yet.</p>}
      </div>
    </div>
  );
}
