import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Table2, Columns3 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import biApi, { BiManualDataset, BiColumn } from '../../api/bi';
import { useBiStore } from '../../store/biStore';

export default function ManualDataPanel() {
  const { manualDatasets, loadManual } = useBiStore();
  const [selected, setSelected] = useState<BiManualDataset | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadManual(); }, []);

  const create = async (name: string, columns: BiColumn[]) => {
    const d = await biApi.createManual({ name, columns });
    await loadManual(); setShowNew(false); setSelected(d);
  };

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
        <button onClick={() => setShowNew(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-3"><Plus size={15} /> New dataset</button>
        {manualDatasets.map((d) => (
          <button key={d.id} onClick={() => setSelected(d)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left mb-1 ${selected?.id === d.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
            <Table2 size={15} /> <span className="truncate">{d.name}</span>
          </button>
        ))}
        <p className="text-xs text-gray-400 px-1 mt-2 leading-relaxed">
          These datasets are <strong>fully editable</strong> — click one to add rows/columns and type values (budgets, targets, assumptions) that feed your calculations. <strong>Files you upload</strong> (CSV/Excel) also appear here and can be edited. Google-synced sheets stay read-only (they refresh from the source).
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        {selected
          ? <GridEditor key={selected.id} dataset={selected} onDeleted={() => { setSelected(null); loadManual(); }} onRenamed={loadManual} />
          : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Select or create a dataset.</div>}
      </div>
      {showNew && <NewDatasetModal onClose={() => setShowNew(false)} onCreate={create} />}
    </div>
  );
}

function GridEditor({ dataset, onDeleted, onRenamed }: { dataset: BiManualDataset; onDeleted: () => void; onRenamed: () => void }) {
  const [cols, setCols] = useState<BiColumn[]>(dataset.columns);
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState(dataset.name);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    biApi.manualRows(dataset.id).then((r) => { setRows(r.rows.length ? r.rows : [emptyRow(dataset.columns)]); }).finally(() => setLoading(false));
  }, [dataset.id]);

  function emptyRow(c: BiColumn[]) { const o: any = {}; c.forEach((col) => (o[col.name] = '')); return o; }

  const setCell = (ri: number, col: string, val: string) => {
    setRows((rs) => { const n = [...rs]; n[ri] = { ...n[ri], [col]: val }; return n; }); setDirty(true);
  };
  const addRow = () => { setRows((rs) => [...rs, emptyRow(cols)]); setDirty(true); };
  const delRow = (ri: number) => { setRows((rs) => rs.filter((_, i) => i !== ri)); setDirty(true); };

  const addColumn = async () => {
    const cn = prompt('Column name'); if (!cn) return;
    const type = (prompt('Type: number / text / date', 'number') || 'text') as any;
    const next = [...cols, { name: cn, type: ['number', 'text', 'date'].includes(type) ? type : 'text' }];
    setCols(next); await biApi.updateManual(dataset.id, { columns: next }); onRenamed();
    setRows((rs) => rs.map((r) => ({ ...r, [cn]: '' }))); setDirty(true);
  };
  const delColumn = async (cn: string) => {
    if (!confirm(`Delete column "${cn}"?`)) return;
    const next = cols.filter((c) => c.name !== cn);
    setCols(next); await biApi.updateManual(dataset.id, { columns: next }); onRenamed();
    setRows((rs) => rs.map((r) => { const { [cn]: _, ...rest } = r; return rest; })); setDirty(true);
  };

  const save = async () => {
    await biApi.saveManualRows(dataset.id, rows);
    if (name !== dataset.name) { await biApi.updateManual(dataset.id, { name }); onRenamed(); }
    setDirty(false); toast.success('Saved');
  };
  const remove = async () => { if (!confirm('Delete this dataset?')) return; await biApi.deleteManual(dataset.id); onDeleted(); };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
        <input className="text-base font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <div className="flex-1" />
        <button onClick={addColumn} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><Columns3 size={14} /> Column</button>
        <button onClick={save} disabled={!dirty} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"><Save size={14} /> Save</button>
        <button onClick={remove} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-8" />
              {cols.map((c) => (
                <th key={c.name} className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-left font-semibold text-gray-600 group">
                  <span className="flex items-center gap-1">{c.name}<span className="text-[10px] text-gray-400">{c.type}</span>
                    <button onClick={() => delColumn(c.name)} className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="group">
                <td className="text-center"><button onClick={() => delRow(ri)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button></td>
                {cols.map((c) => (
                  <td key={c.name} className="border border-gray-200 p-0">
                    <input
                      type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      className="w-full px-3 py-1.5 focus:outline-none focus:bg-blue-50 min-w-[120px]"
                      value={r[c.name] ?? ''} onChange={(e) => setCell(ri, c.name, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"><Plus size={14} /> Add row</button>
      </div>
    </div>
  );
}

function NewDatasetModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, cols: BiColumn[]) => void }) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState<BiColumn[]>([{ name: 'Label', type: 'text' }, { name: 'Value', type: 'number' }]);
  const inp = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  return (
    <Modal title="New manual dataset" onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Name</label><input className={`${inp} w-full`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Budget" /></div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Columns</label>
          {cols.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input className={`${inp} flex-1`} value={c.name} onChange={(e) => { const n = [...cols]; n[i] = { ...n[i], name: e.target.value }; setCols(n); }} />
              <select className={inp} value={c.type} onChange={(e) => { const n = [...cols]; n[i] = { ...n[i], type: e.target.value as any }; setCols(n); }}>
                <option value="text">text</option><option value="number">number</option><option value="date">date</option>
              </select>
              <button onClick={() => setCols(cols.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => setCols([...cols, { name: '', type: 'text' }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus size={14} /> Add column</button>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={() => name.trim() && onCreate(name.trim(), cols.filter((c) => c.name.trim()))} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
      </div>
    </Modal>
  );
}
