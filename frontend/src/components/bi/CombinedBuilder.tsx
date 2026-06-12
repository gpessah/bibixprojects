import { useMemo, useState } from 'react';
import { Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import biApi, { BiColumn, BiCombined } from '../../api/bi';
import { useBiStore } from '../../store/biStore';

type Src = { type: 'datasource' | 'manual'; id: string };
type Join = Src & { leftKey: string; rightKey: string; how: 'left' | 'inner'; alias: string };

export default function CombinedBuilder({ existing, onClose, onSaved }: { existing?: BiCombined; onClose: () => void; onSaved: () => void }) {
  const { datasources, manualDatasets } = useBiStore();
  const [name, setName] = useState(existing?.name || '');
  const [base, setBase] = useState<Src>(existing?.definition?.base || { type: 'manual', id: '' });
  const [joins, setJoins] = useState<Join[]>(
    (existing?.definition?.joins as Join[]) || []
  );
  const [saving, setSaving] = useState(false);

  const colsOf = (s: Src): BiColumn[] => {
    if (!s.id) return [];
    return s.type === 'datasource'
      ? (datasources.find((d) => d.id === s.id)?.column_meta || [])
      : (manualDatasets.find((d) => d.id === s.id)?.columns || []);
  };
  const nameOf = (s: Src) => (s.type === 'datasource' ? datasources : manualDatasets).find((d) => d.id === s.id)?.name || '';

  // Columns available as the "left key" at join i = base + all earlier joins' columns.
  const leftColsAt = (i: number): BiColumn[] => {
    const acc = [...colsOf(base)];
    for (let j = 0; j < i; j++) acc.push(...colsOf(joins[j]));
    const seen = new Set<string>();
    return acc.filter((c) => (seen.has(c.name) ? false : seen.add(c.name)));
  };

  const setJoin = (i: number, patch: Partial<Join>) => setJoins((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  const addJoin = () => setJoins((js) => [...js, { type: 'manual', id: '', leftKey: '', rightKey: '', how: 'left', alias: '' }]);

  const save = async () => {
    if (!name.trim()) return toast.error('Name the combined dataset');
    if (!base.id) return toast.error('Pick a base table');
    if (!joins.length) return toast.error('Add at least one table to join');
    for (const j of joins) if (!j.id || !j.leftKey || !j.rightKey) return toast.error('Each join needs a table and both key fields');
    setSaving(true);
    try {
      const definition = { base, joins: joins.map((j) => ({ ...j, alias: j.alias || nameOf(j) })) };
      if (existing) { await biApi.updateCombined(existing.id, { name: name.trim(), definition }); toast.success('Updated'); }
      else { const r = await biApi.createCombined({ name: name.trim(), definition }); toast.success(`Created — ${r.columns.length} columns, ${r.rowCount} rows`); }
      onSaved();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const inp = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  const lbl = 'block text-xs font-medium text-gray-500 mb-1';
  const datasetSelect = (s: Src, onChange: (s: Src) => void) => (
    <div className="flex gap-2">
      <select className={inp} value={s.type} onChange={(e) => onChange({ type: e.target.value as any, id: '' })}>
        <option value="manual">Manual / uploaded</option><option value="datasource">Google / Drive</option>
      </select>
      <select className={inp} value={s.id} onChange={(e) => onChange({ ...s, id: e.target.value })}>
        <option value="">— table —</option>
        {(s.type === 'datasource' ? datasources : manualDatasets).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  );

  return (
    <Modal title={existing ? 'Edit combined dataset' : 'Combine tables by a key'} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500">Join two or more tables on a shared key (like <code>clientID</code>). The result is a new dataset you can use in any widget or measure — e.g. join Orders to Clients to chart revenue by client region.</p>

        <div><label className={lbl}>Name</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Orders + Clients" /></div>

        <div>
          <label className={lbl}>Base table</label>
          {datasetSelect(base, setBase)}
        </div>

        <div className="space-y-3">
          {joins.map((j, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-600"><LinkIcon size={13} /> Join #{i + 1}
                <div className="flex-1" />
                <select className="px-2 py-1 border border-gray-300 rounded text-xs" value={j.how} onChange={(e) => setJoin(i, { how: e.target.value as any })}>
                  <option value="left">Keep all base rows (left join)</option>
                  <option value="inner">Only matching rows (inner join)</option>
                </select>
                <button onClick={() => setJoins(joins.filter((_, k) => k !== i))} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
              <div><label className={lbl}>Table to join</label>{datasetSelect(j, (s) => setJoin(i, s))}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Base key (left)</label>
                  <select className={inp} value={j.leftKey} onChange={(e) => setJoin(i, { leftKey: e.target.value })}>
                    <option value="">— field —</option>{leftColsAt(i).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Joined key (right)</label>
                  <select className={inp} value={j.rightKey} onChange={(e) => setJoin(i, { rightKey: e.target.value })}>
                    <option value="">— field —</option>{colsOf(j).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={lbl}>Prefix for joined columns (optional)</label><input className={inp} value={j.alias} onChange={(e) => setJoin(i, { alias: e.target.value })} placeholder={nameOf(j) || 'joined'} /></div>
            </div>
          ))}
          <button onClick={addJoin} className="text-sm text-blue-600 flex items-center gap-1"><Plus size={14} /> Add a table to join</button>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : (existing ? 'Save' : 'Create combined dataset')}</button>
      </div>
    </Modal>
  );
}
