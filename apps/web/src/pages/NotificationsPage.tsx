import type { Notification } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';

export function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => api.get<Notification[]>('/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={Bell} title="No notifications" />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-slate-50',
                    !n.read && 'bg-carrier-50/40',
                  )}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-carrier-600',
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-500">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
