import { useState, useEffect, useRef } from 'react';
import { Search, X, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

interface SearchResult {
  boards: { id: string; name: string; icon: string; workspace_name: string }[];
  items: { id: string; name: string; board_id: string; board_name: string; board_icon: string; group_name: string }[];
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ boards: [], items: [] });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) { setResults({ boards: [], items: [] }); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await api.get(`/search?q=${encodeURIComponent(query)}`);
      setResults(data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const total = results.boards.length + results.items.length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="relative mb-6">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search boards and items..."
            className="w-full pl-12 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue shadow-sm" />
          {query && <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={16} /></button>}
        </div>

        {loading && <div className="text-center text-sm text-gray-400 py-4">Searching...</div>}

        {!loading && query.length >= 2 && total === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Search size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No results for "{query}"</p>
          </div>
        )}

        {results.boards.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Boards</h3>
            <div className="space-y-2">
              {results.boards.map(b => (
                <button key={b.id} onClick={() => navigate(`/board/${b.id}`)}
                  className="w-full flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 hover:border-monday-blue hover:shadow-sm transition-all text-left">
                  <span className="text-2xl">{b.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900">{b.name}</div>
                    <div className="text-xs text-gray-400">{b.workspace_name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {results.items.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Items</h3>
            <div className="space-y-2">
              {results.items.map(i => (
                <button key={i.id} onClick={() => navigate(`/board/${i.board_id}`)}
                  className="w-full flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 hover:border-monday-blue hover:shadow-sm transition-all text-left">
                  <span className="text-xl">{i.board_icon}</span>
                  <div>
                    <div className="font-medium text-gray-900">{i.name}</div>
                    <div className="text-xs text-gray-400">{i.board_name} · {i.group_name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
