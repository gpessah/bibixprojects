import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { Notification } from '../../types';

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/notifications').then(r => { setNotifications(r.data); setLoading(false); });
  }, []);

  const markRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: 1 } : x));
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    setNotifications(n => n.map(x => ({ ...x, read: 1 })));
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-monday-blue" />
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unread > 0 && <span className="bg-monday-blue text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-2 text-sm text-monday-blue hover:text-blue-700">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}
        {!loading && notifications.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Bell size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs mt-1">No notifications yet</p>
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {notifications.map(n => (
            <div key={n.id} className={`flex items-start gap-4 px-8 py-4 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50' : ''}`}>
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read ? 'bg-monday-blue' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">{n.title}</div>
                {n.body && <div className="text-sm text-gray-600 mt-0.5 line-clamp-2">{n.body}</div>}
                <div className="text-xs text-gray-400 mt-1">{format(parseISO(n.created_at), 'MMM d, h:mm a')}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {n.link && (
                  <button onClick={() => navigate(n.link!)} className="text-gray-400 hover:text-monday-blue p-1 rounded"><ExternalLink size={14} /></button>
                )}
                {!n.read && (
                  <button onClick={() => markRead(n.id)} className="text-gray-400 hover:text-monday-blue p-1 rounded" title="Mark as read"><Check size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
