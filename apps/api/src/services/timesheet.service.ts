import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type {
  AttendanceSummary,
  BulkDecideTimesheetInput,
  DecideTimesheetInput,
  EmployeeRef,
  Paginated,
  SaveTimesheetInput,
  Timesheet,
  TimesheetListQuery,
} from '@collins-hr/shared';
import { TIMESHEET_POLICY, timesheetWeekDates } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { employees, timeOffRequests, timesheetEntries, timesheets } from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { toEmployeeRef, toTimesheet } from './mappers.js';
import { createNotification } from './notification.service.js';

type TimesheetRow = typeof timesheets.$inferSelect;

async function hydrateRefs(
  db: Database,
  rows: TimesheetRow[],
): Promise<Map<string, EmployeeRef>> {
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.employeeId);
    if (r.approverId) ids.add(r.approverId);
  }
  if (ids.size === 0) return new Map();
  const people = await db
    .select()
    .from(employees)
    .where(inArray(employees.id, [...ids]));
  return new Map(people.map((p) => [p.id, toEmployeeRef(p)]));
}

async function loadTimesheet(db: Database, id: string): Promise<Timesheet> {
  const [row] = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  if (!row) throw NotFound('Timesheet not found');
  const entries = await db
    .select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.timesheetId, id))
    .orderBy(asc(timesheetEntries.date));
  const refs = await hydrateRefs(db, [row]);
  return toTimesheet(row, entries, {
    employee: refs.get(row.employeeId),
    approver: row.approverId ? refs.get(row.approverId) : null,
  });
}

const SORT_COLUMNS = {
  weekStarting: timesheets.weekStarting,
  updatedAt: timesheets.updatedAt,
  status: timesheets.status,
} as const;

export async function listTimesheets(
  db: Database,
  params: {
    employeeId?: string;
    status?: string;
    scopeEmployeeIds?: string[];
    from?: string;
    to?: string;
    sort?: keyof typeof SORT_COLUMNS;
    dir?: 'asc' | 'desc';
  },
): Promise<Timesheet[]> {
  const filters = [];
  if (params.employeeId) filters.push(eq(timesheets.employeeId, params.employeeId));
  if (params.status) filters.push(eq(timesheets.status, params.status));
  if (params.from) filters.push(gte(timesheets.weekStarting, params.from));
  if (params.to) filters.push(lte(timesheets.weekStarting, params.to));
  if (params.scopeEmployeeIds) {
    if (params.scopeEmployeeIds.length === 0) return [];
    filters.push(inArray(timesheets.employeeId, params.scopeEmployeeIds));
  }
  const column = SORT_COLUMNS[params.sort ?? 'weekStarting'];
  const order = params.dir === 'asc' ? asc(column) : desc(column);
  const rows = await db
    .select()
    .from(timesheets)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(order);

  const ids = rows.map((r) => r.id);
  const entries = ids.length
    ? await db.select().from(timesheetEntries).where(inArray(timesheetEntries.timesheetId, ids))
    : [];
  const refs = await hydrateRefs(db, rows);
  return rows.map((r) =>
    toTimesheet(
      r,
      entries.filter((e) => e.timesheetId === r.id),
      { employee: refs.get(r.employeeId), approver: r.approverId ? refs.get(r.approverId) : null },
    ),
  );
}

export async function listTimesheetsPaginated(
  db: Database,
  employeeId: string,
  query: TimesheetListQuery,
): Promise<Paginated<Timesheet>> {
  const all = await listTimesheets(db, {
    employeeId,
    status: query.status,
    from: query.from,
    to: query.to,
    sort: query.sort,
    dir: query.dir,
  });
  const total = all.length;
  const start = (query.page - 1) * query.pageSize;
  return {
    data: all.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getOrCreateWeek(
  db: Database,
  employeeId: string,
  weekStarting: string,
): Promise<Timesheet> {
  if (new Date(`${weekStarting}T00:00:00Z`).getUTCDay() !== 1) {
    throw BadRequest('Week must start on a Monday');
  }
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
  if (sheet.status === 'approved' || sheet.status === 'submitted') {
    throw BadRequest('Only draft or rejected timesheets can be edited');
  }

  await db.delete(timesheetEntries).where(eq(timesheetEntries.timesheetId, sheet.id));
  for (const entry of input.entries) {
    await db.insert(timesheetEntries).values({
      id: createId('tse'),
      timesheetId: sheet.id,
      date: entry.date,
      project: entry.project,
      task: entry.task ?? null,
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

/** Dates within `[from, to]` the employee has approved time off, for overlap guards. */
async function approvedTimeOffDates(
  db: Database,
  employeeId: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const requests = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.employeeId, employeeId),
        eq(timeOffRequests.status, 'approved'),
        lte(timeOffRequests.startDate, to),
        gte(timeOffRequests.endDate, from),
      ),
    );
  const days = new Set<string>();
  for (const r of requests) {
    const cursor = new Date(`${r.startDate}T00:00:00Z`);
    const end = new Date(`${r.endDate}T00:00:00Z`);
    while (cursor <= end) {
      days.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return days;
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
  if (row.status !== 'draft' && row.status !== 'rejected') {
    throw BadRequest('Only draft or rejected timesheets can be submitted');
  }

  const entries = await db
    .select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.timesheetId, id));
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  if (totalHours <= 0) throw BadRequest('Cannot submit an empty timesheet');

  const today = isoToday();
  const maxDate = new Date(`${today}T00:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + TIMESHEET_POLICY.futureGraceDays);
  const cutoff = maxDate.toISOString().slice(0, 10);
  if (entries.some((e) => e.date > cutoff)) {
    throw BadRequest('Timesheet contains future-dated entries beyond policy');
  }

  const week = timesheetWeekDates(row.weekStarting);
  const weekStart = week[0] ?? row.weekStarting;
  const weekEnd = week[week.length - 1] ?? row.weekStarting;
  const onLeave = await approvedTimeOffDates(db, employeeId, weekStart, weekEnd);
  const conflict = entries.find((e) => e.hours > 0 && onLeave.has(e.date));
  if (conflict) {
    throw BadRequest(`Entry on ${conflict.date} overlaps approved time off`);
  }

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
      link: '/timesheets',
    });
  }
  return loadTimesheet(db, id);
}

async function applyDecision(
  db: Database,
  approverId: string,
  row: TimesheetRow,
  decision: 'approved' | 'rejected',
  decisionNote: string | null,
): Promise<void> {
  if (row.status !== 'submitted') throw BadRequest('Only submitted timesheets can be decided');
  if (row.employeeId === approverId) throw Forbidden('You cannot approve your own timesheet');
  await db
    .update(timesheets)
    .set({ status: decision, decisionNote, decidedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(timesheets.id, row.id));
  await createNotification(db, {
    employeeId: row.employeeId,
    type: 'timesheet_reminder',
    title: `Timesheet ${decision}`,
    body: `Your timesheet for week of ${row.weekStarting} was ${decision}.`,
    link: '/timesheets',
  });
}

export async function decideTimesheet(
  db: Database,
  approverId: string,
  id: string,
  input: DecideTimesheetInput,
  options: { isAdmin?: boolean; scopeEmployeeIds?: string[] } = {},
): Promise<Timesheet> {
  const [row] = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
  if (!row) throw NotFound('Timesheet not found');
  if (!options.isAdmin) {
    const inScope =
      row.approverId === approverId || options.scopeEmployeeIds?.includes(row.employeeId);
    if (!inScope) throw Forbidden('You are not the approver for this timesheet');
  }
  await applyDecision(db, approverId, row, input.decision, input.decisionNote ?? null);
  return loadTimesheet(db, id);
}

export async function bulkApproveTimesheets(
  db: Database,
  approverId: string,
  input: BulkDecideTimesheetInput,
  options: { isAdmin?: boolean; scopeEmployeeIds?: string[] } = {},
): Promise<{ approved: string[]; skipped: string[] }> {
  const rows = await db.select().from(timesheets).where(inArray(timesheets.id, input.ids));
  const found = new Map(rows.map((r) => [r.id, r]));
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const id of input.ids) {
    const row = found.get(id);
    if (!row || row.status !== 'submitted' || row.employeeId === approverId) {
      skipped.push(id);
      continue;
    }
    const inScope =
      options.isAdmin ||
      row.approverId === approverId ||
      options.scopeEmployeeIds?.includes(row.employeeId);
    if (!inScope) {
      skipped.push(id);
      continue;
    }
    await applyDecision(db, approverId, row, 'approved', input.decisionNote ?? null);
    approved.push(id);
  }
  return { approved, skipped };
}

export async function getAttendanceSummary(
  db: Database,
  employeeId: string,
  range: { from?: string; to?: string } = {},
): Promise<AttendanceSummary> {
  const sheets = await listTimesheets(db, {
    employeeId,
    from: range.from,
    to: range.to,
    sort: 'weekStarting',
    dir: 'asc',
  });
  const weeks = sheets.map((s) => ({
    weekStarting: s.weekStarting,
    status: s.status,
    totalHours: s.totalHours,
    regularHours: s.regularHours,
    overtimeHours: s.overtimeHours,
  }));
  const totalHours = weeks.reduce((sum, w) => sum + w.totalHours, 0);
  const approvedHours = weeks
    .filter((w) => w.status === 'approved')
    .reduce((sum, w) => sum + w.totalHours, 0);
  const { regularHours, overtimeHours } = weeks.reduce(
    (acc, w) => ({
      regularHours: acc.regularHours + w.regularHours,
      overtimeHours: acc.overtimeHours + w.overtimeHours,
    }),
    { regularHours: 0, overtimeHours: 0 },
  );
  return {
    employeeId,
    weeks,
    totalHours,
    regularHours,
    overtimeHours,
    approvedHours,
    submittedCount: weeks.filter((w) => w.status === 'submitted').length,
    approvedCount: weeks.filter((w) => w.status === 'approved').length,
  };
}
