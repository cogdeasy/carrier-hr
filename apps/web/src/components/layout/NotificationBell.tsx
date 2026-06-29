import type { Notification } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { fetchNotifications, notificationKeys, useUnreadCount } from '../../lib/notifications';

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useUnreadCount();
  const count = unread?.count ?? 0;

  const { data: recent, isLoading } = useQuery({
    queryKey: notificationKeys.list({ recent: true }),
    queryFn: () => fetchNotifications({ page: 1, pageSize: 6 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const openItem = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const items = recent?.data ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-collins-400"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {count > 0 ? (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-collins-700 hover:text-collins-800 disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Bell className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">You're all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      role="menuitem"
                      onClick={() => openItem(n)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50',
                        !n.read && 'bg-collins-50/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-collins-600',
                        )}
                        aria-hidden
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                        <span className="block truncate text-xs text-slate-500">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                      {!n.read ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead.mutate(n.id);
                          }}
                          className="mt-0.5 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                          aria-label="Mark as read"
                          role="button"
                          tabIndex={-1}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-collins-700 hover:bg-slate-50"
          >
            View all
          </button>
        </div>
      ) : null}
    </div>
  );
}
