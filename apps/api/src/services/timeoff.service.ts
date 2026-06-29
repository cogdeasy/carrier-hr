import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  CompanyHoliday,
  CreateTimeOffInput,
  DecideTimeOffInput,
  TimeOffBalance,
  TimeOffRequest,
  TimeOffType,
} from '@carrier-hr/shared';
import { TIME_OFF_TYPES } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import {
  companyHolidays,
  employees,
  timeOffBalances,
  timeOffRequests,
} from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { businessDaysBetween, nowIso, yearOf } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { toEmployeeRef, toTimeOffRequest } from './mappers.js';
import { createNotification } from './notification.service.js';

export async function getBalances(
  db: Database,
  employeeId: string,
  year = new Date().getUTCFullYear(),
): Promise<TimeOffBalance[]> {
  const rows = await db
    .select()
    .from(timeOffBalances)
    .where(and(eq(timeOffBalances.employeeId, employeeId), eq(timeOffBalances.year, year)));

  const pendingRows = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(eq(timeOffRequests.employeeId, employeeId), eq(timeOffRequests.status, 'pending')),
    );
  const pendingByType = new Map<string, number>();
  for (const r of pendingRows) {
    if (yearOf(r.startDate) !== year) continue;
    pendingByType.set(r.type, (pendingByType.get(r.type) ?? 0) + r.totalDays);
  }

  const byType = new Map(rows.map((r) => [r.type, r]));
  return TIME_OFF_TYPES.map((type) => {
    const row = byType.get(type);
    const accrued = row?.accruedDays ?? 0;
    const used = row?.usedDays ?? 0;
    const pending = pendingByType.get(type) ?? 0;
    return {
      type,
      accruedDays: accrued,
      usedDays: used,
      pendingDays: pending,
      availableDays: Math.max(0, accrued - used - pending),
    };
  });
}

export interface ListRequestParams {
  employeeId?: string;
  approverId?: string;
  status?: string;
  scopeEmployeeIds?: string[];
}

export async function listRequests(
  db: Database,
  params: ListRequestParams,
): Promise<TimeOffRequest[]> {
  const filters = [];
  if (params.employeeId) filters.push(eq(timeOffRequests.employeeId, params.employeeId));
  if (params.approverId) filters.push(eq(timeOffRequests.approverId, params.approverId));
  if (params.status) filters.push(eq(timeOffRequests.status, params.status));
  if (params.scopeEmployeeIds) {
    if (params.scopeEmployeeIds.length === 0) return [];
    filters.push(inArray(timeOffRequests.employeeId, params.scopeEmployeeIds));
  }
  const rows = await db
    .select()
    .from(timeOffRequests)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(timeOffRequests.createdAt));

  // Hydrate the employee/approver refs the directory & approvals UI relies on,
  // batch-fetching every referenced person in a single query.
  const personIds = [
    ...new Set(rows.flatMap((r) => [r.employeeId, r.approverId].filter((v): v is string => !!v))),
  ];
  const refs = await employeeRefMap(db, personIds);
  return rows.map((r) =>
    toTimeOffRequest(r, {
      employee: refs.get(r.employeeId),
      approver: r.approverId ? (refs.get(r.approverId) ?? null) : null,
    }),
  );
}

async function employeeRefMap(
  db: Database,
  ids: string[],
): Promise<Map<string, ReturnType<typeof toEmployeeRef>>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(employees).where(inArray(employees.id, ids));
  return new Map(rows.map((row) => [row.id, toEmployeeRef(row)]));
}

export async function createRequest(
  db: Database,
  employeeId: string,
  input: CreateTimeOffInput,
): Promise<TimeOffRequest> {
  const totalDays = businessDaysBetween(input.startDate, input.endDate);
  if (totalDays <= 0) throw BadRequest('Selected range contains no working days');

  if (input.type !== 'unpaid') {
    const balances = await getBalances(db, employeeId, yearOf(input.startDate));
    const balance = balances.find((b) => b.type === input.type);
    if (balance && totalDays > balance.availableDays) {
      throw BadRequest(
        `Insufficient ${input.type} balance: requested ${totalDays} day(s), ${balance.availableDays} available`,
      );
    }
  }

  const [employee] = await db
    .select({ managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) throw NotFound('Employee not found');

  const id = createId('tor');
  const now = nowIso();
  await db.insert(timeOffRequests).values({
    id,
    employeeId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    totalDays,
    reason: input.reason ?? null,
    status: 'pending',
    approverId: employee.managerId,
    createdAt: now,
    updatedAt: now,
  });

  if (employee.managerId) {
    await createNotification(db, {
      employeeId: employee.managerId,
      type: 'timeoff_request',
      title: 'New time-off request',
      body: `A team member requested ${totalDays} day(s) of ${input.type} leave.`,
      link: '/time-off/approvals',
    });
  }

  const [row] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, id)).limit(1);
  return toTimeOffRequest(row!);
}

export async function decideRequest(
  db: Database,
  approverId: string,
  requestId: string,
  input: DecideTimeOffInput,
  options: { isAdmin?: boolean } = {},
): Promise<TimeOffRequest> {
  const [row] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);
  if (!row) throw NotFound('Time-off request not found');
  if (row.status !== 'pending') throw BadRequest('Request has already been decided');
  if (!options.isAdmin && row.approverId !== approverId) {
    throw Forbidden('You are not the approver for this request');
  }
  // Self-approval is forbidden for everyone, including admins: segregation of
  // duties means even an HR admin cannot decide their own time-off request.
  if (row.employeeId === approverId) {
    throw Forbidden('You cannot approve your own time-off request');
  }

  const status = input.decision;
  await db
    .update(timeOffRequests)
    .set({
      status,
      approverId,
      decisionNote: input.decisionNote ?? null,
      decidedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(timeOffRequests.id, requestId));

  if (status === 'approved' && row.type !== 'unpaid') {
    await adjustUsedDays(db, row.employeeId, row.type as TimeOffType, yearOf(row.startDate), row.totalDays);
  }

  await createNotification(db, {
    employeeId: row.employeeId,
    type: 'timeoff_decision',
    title: `Time-off ${status}`,
    body: `Your ${row.type} request for ${row.totalDays} day(s) was ${status}.`,
    link: '/time-off',
  });

  const [updated] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);
  return toTimeOffRequest(updated!);
}

export async function cancelRequest(
  db: Database,
  employeeId: string,
  requestId: string,
): Promise<TimeOffRequest> {
  const [row] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);
  if (!row) throw NotFound('Time-off request not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only cancel your own requests');
  if (row.status !== 'pending') throw BadRequest('Only pending requests can be cancelled');

  await db
    .update(timeOffRequests)
    .set({ status: 'cancelled', updatedAt: nowIso() })
    .where(eq(timeOffRequests.id, requestId));

  const [updated] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);
  return toTimeOffRequest(updated!);
}

async function adjustUsedDays(
  db: Database,
  employeeId: string,
  type: TimeOffType,
  year: number,
  days: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(timeOffBalances)
    .where(
      and(
        eq(timeOffBalances.employeeId, employeeId),
        eq(timeOffBalances.type, type),
        eq(timeOffBalances.year, year),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(timeOffBalances)
      .set({ usedDays: existing.usedDays + days })
      .where(eq(timeOffBalances.id, existing.id));
  } else {
    await db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId,
      type,
      accruedDays: 0,
      usedDays: days,
      year,
    });
  }
}

export async function listHolidays(db: Database, region = 'US'): Promise<CompanyHoliday[]> {
  const rows = await db
    .select()
    .from(companyHolidays)
    .where(eq(companyHolidays.region, region))
    .orderBy(companyHolidays.date);
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, region: r.region }));
}
