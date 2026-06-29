import type {
  Notification,
  NotificationList,
  NotificationPreference,
  NotificationType,
} from '@collins-hr/shared';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
} from '@collins-hr/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import {
  fetchNotifications,
  fetchPreferences,
  groupByDate,
  notificationKeys,
  useUnreadCount,
} from '../lib/notifications';

const PAGE_SIZE = 15;

export function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [unreadOnly, typeFilter]);

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    unread: unreadOnly,
    type: typeFilter === 'all' ? undefined : typeFilter,
  };

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => fetchNotifications(filters),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: notificationKeys.all });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: invalidate,
  });

  const { data: unread } = useUnreadCount();

  const list: NotificationList | undefined = data;
  const notifications = list?.data ?? [];
  const groups = groupByDate(notifications);
  const hasUnread = (unread?.count ?? 0) > 0;

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stay on top of approvals, reminders and announcements."
        actions={
          <>
            <Button
              variant="outline"
              leftIcon={<Settings2 className="h-4 w-4" />}
              onClick={() => setPrefsOpen(true)}
            >
              Preferences
            </Button>
            <Button
              variant="outline"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              loading={markAll.isPending}
              disabled={!hasUnread}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
          role="tablist"
          aria-label="Filter by read state"
        >
          {[
            { key: false, label: 'All' },
            { key: true, label: 'Unread' },
          ].map((tab) => (
            <button
              key={String(tab.key)}
              role="tab"
              aria-selected={unreadOnly === tab.key}
              onClick={() => setUnreadOnly(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition',
                unreadOnly === tab.key
                  ? 'bg-collins-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="type-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NotificationType | 'all')}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-collins-400"
          >
            <option value="all">All categories</option>
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTIFICATION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {isFetching ? <Spinner className="h-4 w-4" /> : null}
      </div>

      {isLoading ? (
        <Card>
          <CardBody className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </CardBody>
        </Card>
      ) : isError ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={TriangleAlert}
              title="Couldn't load notifications"
              description={error instanceof ApiError ? error.message : 'Please try again.'}
              action={
                <Button variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Bell}
              title={unreadOnly ? 'No unread notifications' : 'No notifications'}
              description={
                unreadOnly
                  ? 'You have read everything in this view.'
                  : 'New activity will show up here.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </h2>
              <Card>
                <CardBody className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {group.items.map((n) => (
                      <li
                        key={n.id}
                        className={cn(
                          'group flex items-start gap-3 px-5 py-4 hover:bg-slate-50',
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
                        <button
                          onClick={() => open(n)}
                          className="flex-1 text-left focus:outline-none focus-visible:underline"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">{n.title}</span>
                            <Badge tone="neutral">{NOTIFICATION_CATEGORY[n.type]}</Badge>
                          </span>
                          <span className="block text-sm text-slate-500">{n.body}</span>
                          <span className="mt-1 block text-xs text-slate-400">
                            {formatDateTime(n.createdAt)}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          {!n.read ? (
                            <button
                              onClick={() => markRead.mutate(n.id)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-collins-700 hover:bg-collins-50"
                            >
                              Mark read
                            </button>
                          ) : null}
                          <button
                            onClick={() => dismiss.mutate(n.id)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Dismiss notification"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </section>
          ))}

          {list && list.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {list.page} of {list.totalPages} · {list.total} total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={list.page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={list.page >= list.totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}

function PreferencesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<NotificationPreference[] | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: fetchPreferences,
    enabled: open,
  });

  useEffect(() => {
    if (open && data) setDraft(data.preferences);
  }, [data, open]);

  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  const save = useMutation({
    mutationFn: (preferences: NotificationPreference[]) =>
      api.put('/notifications/preferences', { preferences }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.preferences });
      onClose();
    },
  });

  const toggle = (type: NotificationType) =>
    setDraft((prev) =>
      prev ? prev.map((p) => (p.type === type ? { ...p, muted: !p.muted } : p)) : prev,
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Notification preferences"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={!draft}
            onClick={() => draft && save.mutate(draft)}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Mute a category to stop receiving new notifications of that kind. Existing notifications are
        kept.
      </p>
      {isError ? (
        <p className="py-6 text-center text-sm text-red-600">Couldn't load preferences.</p>
      ) : isLoading || !draft ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {draft.map((pref) => (
            <li key={pref.type} className="flex items-center justify-between py-3">
              <span className="text-sm font-medium text-slate-800">
                {NOTIFICATION_TYPE_LABELS[pref.type]}
              </span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <span className="text-xs text-slate-500">{pref.muted ? 'Muted' : 'On'}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-collins-600 focus:ring-collins-400"
                  checked={!pref.muted}
                  onChange={() => toggle(pref.type)}
                  aria-label={`${NOTIFICATION_TYPE_LABELS[pref.type]} notifications`}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
