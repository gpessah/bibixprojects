import Modal from '../ui/Modal';
import type { BiTheme } from '../../api/bi';

interface Props { theme: BiTheme; onChange: (t: BiTheme) => void; onClose: () => void; }

const PRESETS: { name: string; palette: string[]; accent: string }[] = [
  { name: 'Ocean',  palette: ['#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#6366f1'], accent: '#2563eb' },
  { name: 'Sunset', palette: ['#f97316', '#ef4444', '#ec4899', '#f59e0b', '#d946ef'], accent: '#f97316' },
  { name: 'Forest', palette: ['#16a34a', '#65a30d', '#0d9488', '#059669', '#84cc16'], accent: '#16a34a' },
  { name: 'Grape',  palette: ['#7c3aed', '#a855f7', '#c026d3', '#6366f1', '#8b5cf6'], accent: '#7c3aed' },
  { name: 'Mono',   palette: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'], accent: '#334155' },
];
const BACKGROUNDS = ['#f8fafc', '#ffffff', '#f7fdf9', '#fffaf5', '#faf5ff', '#0f172a'];

export default function ThemePanel({ theme, onChange, onClose }: Props) {
  const set = (patch: Partial<BiTheme>) => onChange({ ...theme, ...patch });
  const lbl = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2';

  return (
    <Modal title="Look & feel" onClose={onClose} size="md">
      <div className="p-6 space-y-6">
        <div>
          <label className={lbl}>Color palette</label>
          <div className="space-y-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => set({ palette: p.palette, accent: p.accent })}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border ${JSON.stringify(theme.palette) === JSON.stringify(p.palette) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex gap-1">{p.palette.map((c) => <span key={c} className="w-5 h-5 rounded" style={{ background: c }} />)}</div>
                <span className="text-sm text-gray-700">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={lbl}>Background</label>
          <div className="flex gap-2 flex-wrap">
            {BACKGROUNDS.map((b) => (
              <button key={b} onClick={() => set({ background: b })}
                className={`w-9 h-9 rounded-lg border-2 ${theme.background === b ? 'border-blue-500' : 'border-gray-200'}`} style={{ background: b }} />
            ))}
          </div>
        </div>

        <div>
          <label className={lbl}>Card style</label>
          <div className="flex gap-2">
            {(['soft', 'bordered', 'flat'] as const).map((s) => (
              <button key={s} onClick={() => set({ cardStyle: s })}
                className={`flex-1 py-2 rounded-lg text-sm capitalize border ${theme.cardStyle === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s}</button>
            ))}
          </div>
        </div>

        <div>
          <label className={lbl}>Font</label>
          <select className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" value={theme.font || 'Inter'} onChange={(e) => set({ font: e.target.value })}>
            {['Inter', 'system-ui', 'Georgia', 'Roboto', 'monospace'].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end px-6 py-4 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Done</button>
      </div>
    </Modal>
  );
}
