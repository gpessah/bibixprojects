import { useState, useEffect, useRef } from 'react';
import { Paperclip, X, Download, FileText } from 'lucide-react';
import api from '../../api/client';

interface Attachment {
  id: string; item_id: string; filename: string; original_name: string;
  mime_type: string; size: number;
}

interface Props {
  itemId: string;
  compact?: boolean;
}

const API_BASE = '/api';

export default function AttachmentsCell({ itemId, compact }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/items/${itemId}/attachments`).then(r => setAttachments(r.data)).catch(() => {});
  }, [itemId]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const upload = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        const { data } = await api.post(`/items/${itemId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setAttachments(a => [...a, data]);
      } catch {}
    }
    setUploading(false);
  };

  const remove = async (id: string) => {
    await api.delete(`/items/${itemId}/attachments/${id}`);
    setAttachments(a => a.filter(x => x.id !== id));
  };

  if (compact) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full h-full flex items-center justify-center gap-1 text-gray-400 hover:text-monday-blue text-xs">
        <Paperclip size={12} />
        {attachments.length > 0 && <span className="font-medium text-gray-600">{attachments.length}</span>}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative w-full h-full">
      <button onClick={() => setOpen(o => !o)}
        className="w-full h-full flex items-center justify-center gap-1 text-gray-400 hover:text-monday-blue text-xs px-2">
        <Paperclip size={13} />
        {attachments.length > 0
          ? <span className="font-medium text-gray-600">{attachments.length} file{attachments.length !== 1 ? 's' : ''}</span>
          : <span>Add files</span>}
      </button>

      {open && (
        <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72"
          style={{ top: ref.current ? ref.current.getBoundingClientRect().bottom + 4 : 0, left: ref.current ? ref.current.getBoundingClientRect().left : 0 }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-800">Attachments</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>

          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {attachments.map(att => {
              const isImage = att.mime_type.startsWith('image/');
              const url = `${API_BASE}/uploads/${att.filename}`;
              return (
                <div key={att.id} className="group flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  {isImage
                    ? <img src={url} className="w-8 h-8 object-cover rounded flex-shrink-0 cursor-pointer" onClick={() => window.open(url, '_blank')} />
                    : <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center flex-shrink-0"><FileText size={14} className="text-gray-400" /></div>
                  }
                  <span className="flex-1 text-xs text-gray-700 truncate">{att.original_name}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <a href={url} download={att.original_name} className="p-0.5 text-gray-400 hover:text-monday-blue"><Download size={12} /></a>
                    <button onClick={() => remove(att.id)} className="p-0.5 text-gray-400 hover:text-red-500"><X size={12} /></button>
                  </div>
                </div>
              );
            })}
            {attachments.length === 0 && !uploading && (
              <p className="text-xs text-gray-400 text-center py-2">No attachments yet</p>
            )}
            {uploading && <p className="text-xs text-gray-400 text-center py-2">Uploading…</p>}
          </div>

          <button onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-500 hover:border-monday-blue hover:text-monday-blue transition-colors">
            <Paperclip size={13} /> Upload file
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        </div>
      )}
    </div>
  );
}
