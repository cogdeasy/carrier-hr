import { and, desc, eq } from 'drizzle-orm';
import type { Notification, NotificationType } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { toNotification } from './mappers.js';

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
  await db.insert(notifications).values({
    id: createId('ntf'),
    employeeId: input.employeeId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
  });
}

export async function listNotifications(
  db: Database,
  employeeId: string,
  unreadOnly = false,
): Promise<Notification[]> {
  const where = unreadOnly
    ? and(eq(notifications.employeeId, employeeId), eq(notifications.read, false))
    : eq(notifications.employeeId, employeeId);
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows.map(toNotification);
}

export async function markRead(db: Database, employeeId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, employeeId)))
    .limit(1);
  if (!row) throw NotFound('Notification not found');
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
}

export async function markAllRead(db: Database, employeeId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.employeeId, employeeId));
}
