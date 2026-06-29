import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DecideTimesheetInput, SaveTimesheetInput, Timesheet } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { timesheetEntries, timesheets } from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { nowIso } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { toTimesheet } from './mappers.js';
import { createNotification } from './notification.service.js';

async function loadTimesheet(db: Database, id: string): Promise<Timesheet> {
  const [row] = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  if (!row) throw NotFound('Timesheet not found');
  const entries = await db
    .select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.timesheetId, id));
  return toTimesheet(row, entries);
}

export async function listTimesheets(
  db: Database,
  params: { employeeId?: string; status?: string; scopeEmployeeIds?: string[] },
): Promise<Timesheet[]> {
  const filters = [];
  if (params.employeeId) filters.push(eq(timesheets.employeeId, params.employeeId));
  if (params.status) filters.push(eq(timesheets.status, params.status));
  if (params.scopeEmployeeIds) {
    if (params.scopeEmployeeIds.length === 0) return [];
    filters.push(inArray(timesheets.employeeId, params.scopeEmployeeIds));
  }
  const rows = await db
    .select()
    .from(timesheets)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(timesheets.weekStarting));

  const ids = rows.map((r) => r.id);
  const entries = ids.length
    ? await db.select().from(timesheetEntries).where(inArray(timesheetEntries.timesheetId, ids))
    : [];
  return rows.map((r) =>
    toTimesheet(
      r,
      entries.filter((e) => e.timesheetId === r.id),
    ),
  );
}

export async function getOrCreateWeek(
  db: Database,
  employeeId: string,
  weekStarting: string,
): Promise<Timesheet> {
  const [existing] = await db
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.employeeId, employeeId), eq(timesheets.weekStarting, weekStarting)))
    .limit(1);
  if (existing) return loadTimesheet(db, existing.id);

  const id = createId('tms');
  await db.insert(timesheets).values({ id, employeeId, weekStarting, status: 'draft' });
  return loadTimesheet(db, id);
}

export async function saveTimesheet(
  db: Database,
  employeeId: string,
  input: SaveTimesheetInput,
): Promise<Timesheet> {
  const sheet = await getOrCreateWeek(db, employeeId, input.weekStarting);
  if (sheet.status === 'approved') throw BadRequest('Approved timesheets cannot be edited');

  await db.delete(timesheetEntries).where(eq(timesheetEntries.timesheetId, sheet.id));
  for (const entry of input.entries) {
    await db.insert(timesheetEntries).values({
      id: createId('tse'),
      timesheetId: sheet.id,
      date: entry.date,
      project: entry.project,
      hours: entry.hours,
      notes: entry.notes ?? null,
    });
  }
  await db
    .update(timesheets)
    .set({ status: 'draft', updatedAt: nowIso() })
    .where(eq(timesheets.id, sheet.id));
  return loadTimesheet(db, sheet.id);
}

export async function submitTimesheet(
  db: Database,
  employeeId: string,
  id: string,
  approverId: string | null,
): Promise<Timesheet> {
  const [row] = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  if (!row) throw NotFound('Timesheet not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only submit your own timesheet');
  await db
    .update(timesheets)
    .set({ status: 'submitted', approverId, submittedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(timesheets.id, id));
  if (approverId) {
    await createNotification(db, {
      employeeId: approverId,
      type: 'timesheet_reminder',
      title: 'Timesheet submitted for approval',
      body: `A timesheet for week of ${row.weekStarting} is awaiting your review.`,
      link: '/timesheets/approvals',
    });
  }
  return loadTimesheet(db, id);
}

export async function decideTimesheet(
  db: Database,
  approverId: string,
  id: string,
  input: DecideTimesheetInput,
  options: { isAdmin?: boolean } = {},
): Promise<Timesheet> {
  const [row] = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  if (!row) throw NotFound('Timesheet not found');
  if (row.status !== 'submitted') throw BadRequest('Only submitted timesheets can be decided');
  if (!options.isAdmin && row.approverId !== approverId) {
    throw Forbidden('You are not the approver for this timesheet');
  }
  await db
    .update(timesheets)
    .set({
      status: input.decision,
      decisionNote: input.decisionNote ?? null,
      decidedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(timesheets.id, id));
  await createNotification(db, {
    employeeId: row.employeeId,
    type: 'timesheet_reminder',
    title: `Timesheet ${input.decision}`,
    body: `Your timesheet for week of ${row.weekStarting} was ${input.decision}.`,
    link: '/timesheets',
  });
  return loadTimesheet(db, id);
}
