import type {
  Notification,
  NotificationList,
  NotificationPreference,
  NotificationType,
  UnreadCount,
} from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  list: (filters: Record<string, unknown>) => ['notifications', 'list', filters] as const,
  preferences: ['notifications', 'preferences'] as const,
};

export interface ListNotificationsArgs {
  page?: number;
  pageSize?: number;
  unread?: boolean;
  type?: NotificationType;
}

export function fetchNotifications(args: ListNotificationsArgs): Promise<NotificationList> {
  return api.get<NotificationList>('/notifications', {
    page: args.page,
    pageSize: args.pageSize,
    unread: args.unread ? true : undefined,
    type: args.type,
  });
}

export function useUnreadCount(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => api.get<UnreadCount>('/notifications/unread-count'),
    refetchInterval: options?.refetchInterval ?? 30_000,
  });
}

export function fetchPreferences(): Promise<{ preferences: NotificationPreference[] }> {
  return api.get<{ preferences: NotificationPreference[] }>('/notifications/preferences');
}

/** Buckets notifications under human-friendly date headings, newest first. */
export function groupByDate(items: Notification[]): { label: string; items: Notification[] }[] {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(new Date());
  const day = 86_400_000;

  const labelFor = (iso: string): string => {
    const created = startOf(new Date(iso));
    if (Number.isNaN(created)) return 'Earlier';
    if (created === today) return 'Today';
    if (created === today - day) return 'Yesterday';
    if (created > today - 7 * day) return 'This week';
    if (created > today - 30 * day) return 'This month';
    return 'Earlier';
  };

  const order = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];
  const groups = new Map<string, Notification[]>();
  for (const item of items) {
    const label = labelFor(item.createdAt);
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}
