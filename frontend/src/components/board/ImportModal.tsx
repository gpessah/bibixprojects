import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle, X,
  AlertTriangle, ChevronDown, ChevronUp, RotateCcw, Info,
} from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../api/client';
import { useBoardStore } from '../../store/boardStore';
import toast from 'react-hot-toast';

interface Props { onClose: () => void; }

interface ImportIssue {
  row: number;
  taskName: string;
  field: string;
  value: string;
  reason: string;
  severity: 'error' | 'warning';
}

interface ImportResult {
  imported: number;
  skipped: number;
  groups: number;
  errors: ImportIssue[];
}

const TYPE_EXAMPLES: Record<string, string> = {
  text:        'Sample text',
  number:      '42',
  date:        '15/06/2024',
  status:      'Done',
  priority:    'High',
  checkbox:    'true',
  tags:        'Tag1',
  link:        'https://example.com',
  timeline:    '2024-06-01/2024-06-15',
  person:      '',
  attachments: '',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityIcon({ s }: { s: 'error' | 'warning' }) {
  return s === 'error'
    ? <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
    : <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />;
}

function IssueTable({ issues }: { issues: ImportIssue[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? issues : issues.slice(0, 8);

  return (
    <div className="mt-3">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[48px_1fr_120px_130px_1fr] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="px-3 py-2">Row</div>
          <div className="px-3 py-2">Task</div>
          <div className="px-3 py-2">Field</div>
          <div className="px-3 py-2">Your Value</div>
          <div className="px-3 py-2">Issue</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {visible.map((issue, i) => (
            <div
              key={i}
              className={`grid grid-cols-[48px_1fr_120px_130px_1fr] text-xs items-start py-2 ${
                issue.severity === 'error' ? 'bg-red-50/40' : 'bg-amber-50/30'
              }`}
            >
              <div className="px-3 flex items-center gap-1 pt-0.5">
                <SeverityIcon s={issue.severity} />
                <span className="text-gray-500 font-mono">{issue.row}</span>
              </div>
              <div className="px-3 text-gray-800 font-medium truncate pt-0.5" title={issue.taskName}>
                {issue.taskName}
              </div>
              <div className="px-3 pt-0.5">
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono text-[11px]">
                  {issue.field}
                </span>
              </div>
              <div className="px-3 pt-0.5">
                {issue.value ? (
                  <span className="px-1.5 py-0.5 bg-white border border-gray-200 rounded font-mono text-[11px] text-gray-700 truncate max-w-[120px] inline-block" title={issue.value}>
                    {issue.value.length > 18 ? issue.value.slice(0, 18) + '…' : issue.value}
                  </span>
                ) : (
                  <span className="text-gray-400 italic text-[11px]">(empty)</span>
                )}
              </div>
              <div className="px-3 text-gray-600 leading-relaxed pt-0.5">
                {issue.reason}
              </div>
            </div>
          ))}
        </div>
      </div>

      {issues.length > 8 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-1"
        >
          {showAll
            ? <><ChevronUp size={12} /> Show fewer</>
            : <><ChevronDown size={12} /> Show all {issues.length} issues</>}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportModal({ onClose }: Props) {
  const { board, loadBoard } = useBoardStore();
  const [dragging, setDragging]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Download template ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    if (!board) return;
    const cols = board.columns;
    const headers = ['Group', 'Task Name', 'Parent Task (leave blank for top-level task)', ...cols.map(c => c.name)];
    const ex1 = ['Project Alpha', 'Design mockups', '',           ...cols.map(c => TYPE_EXAMPLES[c.type] ?? '')];
    const ex2 = ['Project Alpha', 'Review design', 'Design mockups', ...cols.map(c => TYPE_EXAMPLES[c.type] ?? '')];
    const ex3 = ['Project Beta',  'Backend setup',  '',           ...cols.map(c => TYPE_EXAMPLES[c.type] ?? '')];

    const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3]);
    ws['!cols'] = headers.map((h, i) => ({ wch: i === 2 ? 38 : Math.max(h.length + 2, 18) }));

    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F0FE' } } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `${board.name.replace(/[^a-z0-9]/gi, '_')}_import_template.xlsx`);
  };

  // ── Run import ─────────────────────────────────────────────────────────────
  const doImport = useCallback(async (file: File) => {
    if (!board) return;
    setFatalError(null);
    setResult(null);
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Do NOT set Content-Type manually — Axios must auto-generate the
      // multipart/form-data boundary, otherwise multer can't parse the file.
      const { data } = await api.post<ImportResult>(`/boards/${board.id}/import`, form);
      setResult(data);
      await loadBoard(board.id);

      if (data.imported > 0) {
        toast.success(`${data.imported} task${data.imported !== 1 ? 's' : ''} imported`);
      } else if (data.skipped > 0) {
        toast.error('No tasks were imported — check the error report below');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Import failed. Please try again.';
      setFatalError(msg);
    } finally {
      setImporting(false);
    }
  }, [board, loadBoard]);

  const handleFile = (file: File) => {
    const ok = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    if (!ok) { setFatalError('Please upload an .xlsx, .xls, or .csv file.'); return; }
    doImport(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const resetState = () => { setResult(null); setFatalError(null); };

  if (!board) return null;
  const cols = board.columns;

  // ── Derived stats ──────────────────────────────────────────────────────────
  const errorIssues   = result?.errors.filter(e => e.severity === 'error')   ?? [];
  const warningIssues = result?.errors.filter(e => e.severity === 'warning') ?? [];
  const hasIssues     = (result?.errors.length ?? 0) > 0;
  const modalSize     = hasIssues ? 'xl' : 'md';

  return (
    <Modal title="Import from Excel / CSV" onClose={onClose} size={modalSize}>
      <div className="p-6 space-y-5">

        {/* ── Step 1: Download template ──────────────────────────────────── */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-monday-blue text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Download the template</p>
              <p className="text-xs text-gray-500 mt-0.5">
                A ready-made Excel file with all {cols.length} column{cols.length !== 1 ? 's' : ''} of this board pre-filled as headers.
              </p>
            </div>
          </div>

          <div className="ml-10 mb-3">
            <p className="text-xs text-gray-400 mb-1.5 font-medium">Columns in the template:</p>
            <div className="flex flex-wrap gap-1">
              {['Group', 'Task Name', 'Parent Task', ...cols.map(c => c.name)].map(name => (
                <span key={name} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{name}</span>
              ))}
            </div>
          </div>

          <button
            onClick={downloadTemplate}
            className="ml-10 flex items-center gap-2 px-4 py-2 bg-monday-blue text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Download size={15} /> Download Template
          </button>
        </div>

        {/* ── Step 2: Upload ─────────────────────────────────────────────── */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-monday-blue text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Upload your completed file</p>
              <p className="text-xs text-gray-500 mt-0.5">Accepts .xlsx, .xls, or .csv</p>
            </div>
          </div>

          {/* Drop zone — hidden after a successful result */}
          {!result && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !importing && fileRef.current?.click()}
              className={[
                'ml-10 border-2 border-dashed rounded-lg p-6 text-center transition-colors',
                dragging   ? 'border-monday-blue bg-blue-50' : 'border-gray-200 hover:border-monday-blue hover:bg-gray-50',
                importing  ? 'cursor-wait opacity-60' : 'cursor-pointer',
              ].join(' ')}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Importing…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet size={28} className="text-gray-300" />
                  <p className="text-sm text-gray-500">
                    Drag & drop your file here, or <span className="text-monday-blue font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    Each row becomes a task · Use "Parent Task" column to create subtasks
                  </p>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />

          {/* Fatal error */}
          {fatalError && (
            <div className="ml-10 mt-3 flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs flex-1">{fatalError}</p>
              <button onClick={resetState} className="text-red-400 hover:text-red-600"><X size={13} /></button>
            </div>
          )}

          {/* ── Result panel ──────────────────────────────────────────────── */}
          {result && (
            <div className="ml-10 mt-3 space-y-3">

              {/* Success bar */}
              {result.imported > 0 && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle size={15} className="flex-shrink-0" />
                  <p className="text-xs font-medium">
                    {result.imported} task{result.imported !== 1 ? 's' : ''} imported successfully
                    {result.groups > 0 && ` · ${result.groups} new group${result.groups !== 1 ? 's' : ''} created`}
                  </p>
                </div>
              )}

              {/* Skipped rows (errors) */}
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <p className="text-xs font-medium">
                    {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped — missing Task Name (see table below)
                  </p>
                </div>
              )}

              {/* Nothing imported at all */}
              {result.imported === 0 && result.skipped === 0 && (
                <div className="flex items-center gap-2 text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <Info size={15} className="flex-shrink-0" />
                  <p className="text-xs">The file had no valid rows to import.</p>
                </div>
              )}

              {/* Field warnings */}
              {warningIssues.length > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={15} className="flex-shrink-0" />
                  <p className="text-xs font-medium">
                    {warningIssues.length} field value{warningIssues.length !== 1 ? 's' : ''} could not be imported
                    {result.imported > 0 && ' — the tasks themselves were still created'}
                  </p>
                </div>
              )}

              {/* Issue detail table */}
              {hasIssues && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
                    <AlertCircle size={12} className="text-red-400" />
                    Issue details
                  </p>
                  <IssueTable issues={result.errors} />
                </div>
              )}

              {/* Try again */}
              <button
                onClick={resetState}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mt-1"
              >
                <RotateCcw size={12} /> Import another file
              </button>
            </div>
          )}
        </div>

        {/* ── Tips ──────────────────────────────────────────────────────── */}
        {!result && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Tips for a smooth import</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>The <strong>Group</strong> column controls which section tasks appear in.</li>
              <li>Leave <strong>Parent Task</strong> blank for top-level tasks; enter a task name to make it a subtask.</li>
              <li>Date columns expect <strong>DD/MM/YYYY</strong> (e.g. 15/06/2024). YYYY-MM-DD also accepted.</li>
              <li>Status / Priority values must exactly match one of the options configured on the column.</li>
              <li>Checkbox values: <strong>true / false / yes / no / 1 / 0</strong>.</li>
              <li>Timeline format: <strong>YYYY-MM-DD/YYYY-MM-DD</strong> (start/end separated by <code>/</code>).</li>
              <li>If a value is invalid, the task is still imported — only that field is skipped.</li>
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={14} /> Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
