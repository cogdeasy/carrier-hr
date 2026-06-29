import { and, count, desc, eq } from 'drizzle-orm';
import type {
  Notification,
  NotificationPreference,
  NotificationType,
  Paginated,
} from '@collins-hr/shared';
import { NOTIFICATION_TYPES } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { notificationPreferences, notifications } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { offset, paginate } from '../lib/pagination.js';
import { toNotification } from './mappers.js';

async function isMuted(
  db: Database,
  employeeId: string,
  type: NotificationType,
): Promise<boolean> {
  const [row] = await db
    .select({ muted: notificationPreferences.muted })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.employeeId, employeeId),
        eq(notificationPreferences.type, type),
      ),
    )
    .limit(1);
  return row?.muted ?? false;
}

export async function createNotification(
  db: Database,
  input: {
    employeeId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
  },
): Promise<void> {
  // Respect the recipient's muted categories: a muted type is dropped silently
  // rather than persisted, so it never affects unread counts or lists.
  if (await isMuted(db, input.employeeId, input.type)) return;
  await db.insert(notifications).values({
    id: createId('ntf'),
    employeeId: input.employeeId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
  });
}

export interface ListNotificationsParams {
  page: number;
  pageSize: number;
  unread?: boolean;
  type?: NotificationType;
}

export async function listNotifications(
  db: Database,
  employeeId: string,
  params: ListNotificationsParams,
): Promise<Paginated<Notification>> {
  const filters = [eq(notifications.employeeId, employeeId)];
  if (params.unread) filters.push(eq(notifications.read, false));
  if (params.type) filters.push(eq(notifications.type, params.type));
  const where = and(...filters);

  const totalRows = await db.select({ value: count() }).from(notifications).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(params.pageSize)
    .offset(offset(params.page, params.pageSize));

  return paginate(rows.map(toNotification), total, params.page, params.pageSize);
}

export async function unreadCount(db: Database, employeeId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.employeeId, employeeId), eq(notifications.read, false)));
  return rows[0]?.value ?? 0;
}

export async function markRead(db: Database, employeeId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, employeeId)))
    .limit(1);
  if (!row) throw NotFound('Notification not found');
  // Scope the write by owner as well as id so the update can never touch
  // another employee's notification, even if ownership shifted after the read.
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, employeeId)));
}

export async function markAllRead(db: Database, employeeId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.employeeId, employeeId), eq(notifications.read, false)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function deleteNotification(
  db: Database,
  employeeId: string,
  id: string,
): Promise<void> {
  const rows = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, employeeId)))
    .returning({ id: notifications.id });
  if (rows.length === 0) throw NotFound('Notification not found');
}

export async function getPreferences(
  db: Database,
  employeeId: string,
): Promise<NotificationPreference[]> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.employeeId, employeeId));
  const muted = new Map(rows.map((r) => [r.type, r.muted]));
  // Surface every category so the UI can render a complete toggle list,
  // defaulting unconfigured categories to unmuted.
  return NOTIFICATION_TYPES.map((type) => ({ type, muted: muted.get(type) ?? false }));
}

export async function setPreferences(
  db: Database,
  employeeId: string,
  preferences: NotificationPreference[],
): Promise<NotificationPreference[]> {
  for (const pref of preferences) {
    await db
      .insert(notificationPreferences)
      .values({
        id: createId('ntp'),
        employeeId,
        type: pref.type,
        muted: pref.muted,
        updatedAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.employeeId, notificationPreferences.type],
        set: { muted: pref.muted, updatedAt: nowIso() },
      });
  }
  return getPreferences(db, employeeId);
}
