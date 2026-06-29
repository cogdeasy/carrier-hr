import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type {
  CompanyHoliday,
  CreateCompanyHolidayInput,
  CreateTimeOffInput,
  DecideTimeOffInput,
  ListTimeOffQuery,
  Paginated,
  TimeOffBalance,
  TimeOffPolicy,
  TimeOffRequest,
  TimeOffType,
  UpdateCompanyHolidayInput,
} from '@collins-hr/shared';
import type { Role } from '@collins-hr/shared';
import {
  DEFAULT_TIME_OFF_POLICIES,
  TIME_OFF_TYPES,
  hasPermission,
  isAccrualTimeOffType,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  companyHolidays,
  employees,
  timeOffBalances,
  timeOffPolicies,
  timeOffRequests,
} from '../db/schema.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { nowIso, yearOf } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { paginate, offset } from '../lib/pagination.js';
import { toEmployeeRef, toTimeOffRequest } from './mappers.js';
import { createNotification } from './notification.service.js';

const ACTIVE_STATUSES = ['pending', 'approved'] as const;

/** Inclusive count of weekdays in a range, skipping the supplied holiday dates. */
function countWorkingDays(startIso: string, endIso: string, holidays: Set<string>): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (end < start) return 0;
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function holidayDatesInRange(
  db: Database,
  region: string,
  startIso: string,
  endIso: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(
      and(
        eq(companyHolidays.region, region),
        gte(companyHolidays.date, startIso),
        lte(companyHolidays.date, endIso),
      ),
    );
  return new Set(rows.map((r) => r.date));
}

export async function getPolicies(db: Database): Promise<TimeOffPolicy[]> {
  const rows = await db.select().from(timeOffPolicies);
  const byType = new Map(rows.map((r) => [r.type, r]));
  return DEFAULT_TIME_OFF_POLICIES.map((fallback) => {
    const row = byType.get(fallback.type);
    if (!row) return fallback;
    return {
      type: fallback.type,
      accrual: row.accrual,
      annualAccrualDays: row.annualAccrualDays,
      maxCarryoverDays: row.maxCarryoverDays,
      requiresApproval: row.requiresApproval,
    };
  });
}

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

  const policies = await getPolicies(db);
  const policyByType = new Map(policies.map((p) => [p.type, p]));
  const byType = new Map(rows.map((r) => [r.type, r]));
  return TIME_OFF_TYPES.map((type) => {
    const row = byType.get(type);
    const accrued = row?.accruedDays ?? 0;
    const used = row?.usedDays ?? 0;
    const pending = pendingByType.get(type) ?? 0;
    const remaining = Math.max(0, accrued - used);
    const cap = policyByType.get(type)?.maxCarryoverDays ?? 0;
    return {
      type,
      accruedDays: accrued,
      usedDays: used,
      pendingDays: pending,
      availableDays: Math.max(0, accrued - used - pending),
      carryoverEligibleDays: Math.min(remaining, cap),
    };
  });
}

export interface ListRequestParams {
  employeeId?: string;
  approverId?: string;
  status?: string;
  scopeEmployeeIds?: string[];
}

function listFilters(params: ListRequestParams) {
  const filters = [];
  if (params.employeeId) filters.push(eq(timeOffRequests.employeeId, params.employeeId));
  if (params.approverId) filters.push(eq(timeOffRequests.approverId, params.approverId));
  if (params.status) filters.push(eq(timeOffRequests.status, params.status));
  if (params.scopeEmployeeIds) {
    filters.push(inArray(timeOffRequests.employeeId, params.scopeEmployeeIds));
  }
  return filters;
}

export async function listRequests(
  db: Database,
  params: ListRequestParams,
): Promise<TimeOffRequest[]> {
  if (params.scopeEmployeeIds && params.scopeEmployeeIds.length === 0) return [];
  const filters = listFilters(params);
  const rows = await db
    .select()
    .from(timeOffRequests)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(timeOffRequests.createdAt));
  return hydrate(db, rows);
}

export async function listRequestsPaginated(
  db: Database,
  base: ListRequestParams,
  query: ListTimeOffQuery,
): Promise<Paginated<TimeOffRequest>> {
  if (base.scopeEmployeeIds && base.scopeEmployeeIds.length === 0) {
    return paginate([], 0, query.page, query.pageSize);
  }
  const filters = listFilters({ ...base, status: query.status ?? base.status });
  if (query.type) filters.push(eq(timeOffRequests.type, query.type));
  if (query.from) filters.push(gte(timeOffRequests.startDate, query.from));
  if (query.to) filters.push(lte(timeOffRequests.startDate, query.to));
  const where = filters.length ? and(...filters) : undefined;

  const totalRows = await db.select({ value: count() }).from(timeOffRequests).where(where);
  const total = totalRows[0]?.value ?? 0;

  const column = query.sort === 'startDate' ? timeOffRequests.startDate : timeOffRequests.createdAt;
  const direction = query.order === 'asc' ? asc(column) : desc(column);
  const rows = await db
    .select()
    .from(timeOffRequests)
    .where(where)
    .orderBy(direction)
    .limit(query.pageSize)
    .offset(offset(query.page, query.pageSize));

  const data = await hydrate(db, rows);
  return paginate(data, total, query.page, query.pageSize);
}

async function hydrate(
  db: Database,
  rows: (typeof timeOffRequests.$inferSelect)[],
): Promise<TimeOffRequest[]> {
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
  const holidays = await holidayDatesInRange(db, 'US', input.startDate, input.endDate);
  const totalDays = countWorkingDays(input.startDate, input.endDate, holidays);
  if (totalDays <= 0) {
    throw BadRequest('Selected range contains no working days (weekends and company holidays are excluded)');
  }

  await assertNoOverlap(db, employeeId, input.startDate, input.endDate);

  // Only accrual leave (vacation/sick/personal) draws down a balance. Other
  // types (bereavement, jury_duty, parental, unpaid) are granted without a
  // balance check, so they must not be gated on a (non-existent) accrual.
  if (isAccrualTimeOffType(input.type)) {
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
    attachmentUrl: input.attachmentUrl ?? null,
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
      link: '/time-off',
    });
  }

  const [row] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, id)).limit(1);
  return toTimeOffRequest(row!);
}

async function assertNoOverlap(
  db: Database,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<void> {
  const conflicts = await db
    .select({ id: timeOffRequests.id })
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.employeeId, employeeId),
        inArray(timeOffRequests.status, [...ACTIVE_STATUSES]),
        lte(timeOffRequests.startDate, endDate),
        gte(timeOffRequests.endDate, startDate),
        excludeId ? ne(timeOffRequests.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (conflicts.length > 0) {
    throw Conflict('This range overlaps an existing time-off request');
  }
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
  if (status === 'approved' && isAccrualTimeOffType(row.type)) {
    await assertWithinBalance(db, row.employeeId, row.type as TimeOffType, yearOf(row.startDate), row.totalDays);
  }

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

  if (status === 'approved' && isAccrualTimeOffType(row.type)) {
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

  if (row.status === 'pending') {
    await db
      .update(timeOffRequests)
      .set({ status: 'cancelled', updatedAt: nowIso() })
      .where(eq(timeOffRequests.id, requestId));
  } else if (row.status === 'approved') {
    // Approved leave can only be withdrawn before it begins; once it has
    // started the time is considered taken. Cancelling refunds any used accrual.
    const today = new Date().toISOString().slice(0, 10);
    if (row.startDate <= today) {
      throw BadRequest('Approved leave that has already started cannot be cancelled');
    }
    await db
      .update(timeOffRequests)
      .set({ status: 'cancelled', updatedAt: nowIso() })
      .where(eq(timeOffRequests.id, requestId));
    if (isAccrualTimeOffType(row.type)) {
      await adjustUsedDays(db, row.employeeId, row.type as TimeOffType, yearOf(row.startDate), -row.totalDays);
    }
  } else {
    throw BadRequest('Only pending or upcoming approved requests can be cancelled');
  }

  const [updated] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);
  return toTimeOffRequest(updated!);
}

async function assertWithinBalance(
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
  const accrued = existing?.accruedDays ?? 0;
  const used = existing?.usedDays ?? 0;
  if (used + days > accrued) {
    throw BadRequest(
      `Approving would overdraw ${type} balance: ${used + days} of ${accrued} accrued day(s)`,
    );
  }
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
    // Atomic increment so concurrent approvals can't clobber each other's
    // update (the read-then-write race window on libSQL/Turso). A floor of 0
    // guards against a refund dropping used days below zero.
    await db
      .update(timeOffBalances)
      .set({ usedDays: sql`max(0, ${timeOffBalances.usedDays} + ${days})` })
      .where(eq(timeOffBalances.id, existing.id));
  } else if (days > 0) {
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

/**
 * Year-end roll-forward: for every accrual balance in `fromYear`, carry the
 * lesser of the remaining balance and the policy cap into the next year, on top
 * of that year's fresh annual accrual. Idempotent per (employee, type, year).
 */
export async function runCarryover(
  db: Database,
  fromYear: number,
): Promise<{ processed: number; toYear: number }> {
  const toYear = fromYear + 1;
  const policies = await getPolicies(db);
  const policyByType = new Map(policies.map((p) => [p.type, p]));

  const sourceRows = await db
    .select()
    .from(timeOffBalances)
    .where(eq(timeOffBalances.year, fromYear));

  let processed = 0;
  for (const row of sourceRows) {
    const policy = policyByType.get(row.type as TimeOffType);
    if (!policy?.accrual) continue;
    const remaining = Math.max(0, row.accruedDays - row.usedDays);
    const carried = Math.min(remaining, policy.maxCarryoverDays);
    const accrued = policy.annualAccrualDays + carried;

    const [existing] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, row.employeeId),
          eq(timeOffBalances.type, row.type),
          eq(timeOffBalances.year, toYear),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(timeOffBalances)
        .set({ accruedDays: accrued })
        .where(eq(timeOffBalances.id, existing.id));
    } else {
      await db.insert(timeOffBalances).values({
        id: createId('tob'),
        employeeId: row.employeeId,
        type: row.type,
        accruedDays: accrued,
        usedDays: 0,
        year: toYear,
      });
    }
    processed += 1;
  }
  return { processed, toYear };
}

/**
 * The set of employees a viewer may see leave for: HR/admins see everyone,
 * managers see their direct reports plus themselves, everyone else sees only
 * their own.
 */
export async function calendarScope(
  db: Database,
  employeeId: string,
  roles: Role[],
): Promise<string[]> {
  if (hasPermission(roles, 'timeoff:read')) {
    const rows = await db.select({ id: employees.id }).from(employees);
    return rows.map((r) => r.id);
  }
  if (hasPermission(roles, 'timeoff:read:team')) {
    const reports = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.managerId, employeeId));
    return [employeeId, ...reports.map((r) => r.id)];
  }
  return [employeeId];
}

export async function getTeamCalendar(
  db: Database,
  scopeEmployeeIds: string[],
  from: string,
  to: string,
): Promise<TimeOffRequest[]> {
  if (scopeEmployeeIds.length === 0) return [];
  const rows = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(
        inArray(timeOffRequests.employeeId, scopeEmployeeIds),
        inArray(timeOffRequests.status, [...ACTIVE_STATUSES]),
        lte(timeOffRequests.startDate, to),
        gte(timeOffRequests.endDate, from),
      ),
    )
    .orderBy(asc(timeOffRequests.startDate));
  return hydrate(db, rows);
}

export async function listHolidays(db: Database, region = 'US'): Promise<CompanyHoliday[]> {
  const rows = await db
    .select()
    .from(companyHolidays)
    .where(eq(companyHolidays.region, region))
    .orderBy(companyHolidays.date);
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, region: r.region }));
}

export async function createHoliday(
  db: Database,
  input: CreateCompanyHolidayInput,
): Promise<CompanyHoliday> {
  const region = input.region ?? 'US';
  const [dup] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(and(eq(companyHolidays.date, input.date), eq(companyHolidays.region, region)))
    .limit(1);
  if (dup) throw Conflict('A holiday already exists on that date for this region');

  const id = createId('hol');
  await db.insert(companyHolidays).values({ id, name: input.name, date: input.date, region });
  return { id, name: input.name, date: input.date, region };
}

export async function updateHoliday(
  db: Database,
  id: string,
  input: UpdateCompanyHolidayInput,
): Promise<CompanyHoliday> {
  const [row] = await db.select().from(companyHolidays).where(eq(companyHolidays.id, id)).limit(1);
  if (!row) throw NotFound('Holiday not found');
  const next = {
    name: input.name ?? row.name,
    date: input.date ?? row.date,
    region: input.region ?? row.region,
  };
  const [dup] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(
      and(
        eq(companyHolidays.date, next.date),
        eq(companyHolidays.region, next.region),
        ne(companyHolidays.id, id),
      ),
    )
    .limit(1);
  if (dup) throw Conflict('A holiday already exists on that date for this region');

  await db.update(companyHolidays).set(next).where(eq(companyHolidays.id, id));
  return { id, ...next };
}

export async function deleteHoliday(db: Database, id: string): Promise<void> {
  const [row] = await db.select({ id: companyHolidays.id }).from(companyHolidays).where(eq(companyHolidays.id, id)).limit(1);
  if (!row) throw NotFound('Holiday not found');
  await db.delete(companyHolidays).where(eq(companyHolidays.id, id));
}
