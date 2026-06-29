import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import {
  ACCRUAL_TIME_OFF_TYPES,
  type AnalyticsDataset,
  type AnalyticsFilters,
  type CategoryCount,
  type EmployeeDashboard,
  type HrDashboard,
  type TeamDashboard,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  companyHolidays,
  courseEnrollments,
  courses,
  employees,
  goals,
  jobRequisitions,
  notifications,
  reviews,
  timeOffBalances,
  timeOffRequests,
  timesheets,
} from '../db/schema.js';
import { getBalances } from './timeoff.service.js';

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Resolve the effective analysis window. Defaults to a trailing 12 calendar
 * months ending today when the caller does not supply explicit bounds.
 */
function resolveRange(filters: AnalyticsFilters): { from: string; to: string } {
  const now = new Date();
  const to = filters.to ?? isoDay(now);
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const from = filters.from ?? isoDay(defaultFrom);
  return { from, to };
}

/** Build the categorical predicate shared by the headcount distributions. */
function populationFilter(filters: AnalyticsFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.department) conditions.push(eq(employees.department, filters.department));
  if (filters.division) conditions.push(eq(employees.division, filters.division));
  if (filters.location) conditions.push(eq(employees.location, filters.location));
  if (filters.status) conditions.push(eq(employees.status, filters.status));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function toCategoryCounts(rows: { label: string | null; count: number }[]): CategoryCount[] {
  return rows
    .map((r) => ({ label: r.label ?? 'Unspecified', count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
}

const TENURE_BUCKETS: { label: string; maxYears: number }[] = [
  { label: '< 1 year', maxYears: 1 },
  { label: '1–3 years', maxYears: 3 },
  { label: '3–5 years', maxYears: 5 },
  { label: '5–10 years', maxYears: 10 },
  { label: '10+ years', maxYears: Infinity },
];

export async function getHrDashboard(
  db: Database,
  filters: AnalyticsFilters = {},
): Promise<HrDashboard> {
  const { from, to } = resolveRange(filters);
  const population = populationFilter(filters);

  // Headcount distributions are aggregated in SQL over the filtered population.
  // The status distribution intentionally ignores a `status` filter so the
  // breakdown stays meaningful, but still honours the other categorical filters.
  const statusPopulation = (() => {
    const conditions: SQL[] = [];
    if (filters.department) conditions.push(eq(employees.department, filters.department));
    if (filters.division) conditions.push(eq(employees.division, filters.division));
    if (filters.location) conditions.push(eq(employees.location, filters.location));
    return conditions.length > 0 ? and(...conditions) : undefined;
  })();

  const countExpr = sql<number>`count(*)`;
  const [
    byDepartment,
    byDivision,
    byLocation,
    byStatus,
    byEmploymentType,
    byGender,
    statusTotals,
    tenureRows,
    openReqRows,
  ] = await Promise.all([
    db
      .select({ label: employees.department, count: countExpr })
      .from(employees)
      .where(population)
      .groupBy(employees.department),
    db
      .select({ label: employees.division, count: countExpr })
      .from(employees)
      .where(population)
      .groupBy(employees.division),
    db
      .select({ label: employees.location, count: countExpr })
      .from(employees)
      .where(population)
      .groupBy(employees.location),
    db
      .select({ label: employees.status, count: countExpr })
      .from(employees)
      .where(statusPopulation)
      .groupBy(employees.status),
    db
      .select({ label: employees.employmentType, count: countExpr })
      .from(employees)
      .where(population)
      .groupBy(employees.employmentType),
    db
      .select({ label: employees.gender, count: countExpr })
      .from(employees)
      .where(population)
      .groupBy(employees.gender),
    db
      .select({ status: employees.status, count: countExpr })
      .from(employees)
      .where(statusPopulation)
      .groupBy(employees.status),
    db
      .select({ hireDate: employees.hireDate, status: employees.status })
      .from(employees)
      .where(population),
    db
      .select({ label: jobRequisitions.department, count: countExpr })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'open'))
      .groupBy(jobRequisitions.department),
  ]);

  const statusMap = new Map(statusTotals.map((r) => [r.status, Number(r.count)]));
  const activeEmployees = statusMap.get('active') ?? 0;
  const onLeave = statusMap.get('on_leave') ?? 0;
  const terminated = statusMap.get('terminated') ?? 0;
  const totalEmployees = [...statusMap.values()].reduce((a, b) => a + b, 0);

  // Tenure for the active population, bucketed for distribution display.
  const now = new Date();
  const tenureCounts = new Map<string, number>(TENURE_BUCKETS.map((b) => [b.label, 0]));
  const activeTenures: number[] = [];
  for (const row of tenureRows) {
    if (row.status !== 'active') continue;
    const years = (now.getTime() - new Date(`${row.hireDate}T00:00:00Z`).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    activeTenures.push(years);
    const bucket = TENURE_BUCKETS.find((b) => years < b.maxYears) ?? TENURE_BUCKETS.at(-1)!;
    tenureCounts.set(bucket.label, (tenureCounts.get(bucket.label) ?? 0) + 1);
  }
  const avgTenureYears =
    activeTenures.length > 0
      ? round(activeTenures.reduce((a, b) => a + b, 0) / activeTenures.length)
      : 0;

  // Hires and terminations within the window, aggregated in SQL.
  const [hireCountRow] = await db
    .select({ count: countExpr })
    .from(employees)
    .where(and(gte(employees.hireDate, from), lte(employees.hireDate, to)));
  const hiresInRange = Number(hireCountRow?.count ?? 0);

  const [termCountRow] = await db
    .select({ count: countExpr })
    .from(employees)
    .where(
      and(
        sql`${employees.terminationDate} is not null`,
        gte(employees.terminationDate, from),
        lte(employees.terminationDate, to),
      ),
    );
  const terminationsInRange = Number(termCountRow?.count ?? 0);

  const thisMonth = monthKey(now);
  const [newHiresRow] = await db
    .select({ count: countExpr })
    .from(employees)
    .where(sql`substr(${employees.hireDate}, 1, 7) = ${thisMonth}`);
  const newHiresThisMonth = Number(newHiresRow?.count ?? 0);

  // Monthly hires/terminations grouped in SQL, then folded into a point-in-time
  // headcount trend across the window's calendar months.
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const [hiresByMonth, termsByMonth, headcountSnapshot] = await Promise.all([
    db
      .select({ month: sql<string>`substr(${employees.hireDate}, 1, 7)`, count: countExpr })
      .from(employees)
      .groupBy(sql`substr(${employees.hireDate}, 1, 7)`),
    db
      .select({
        month: sql<string>`substr(${employees.terminationDate}, 1, 7)`,
        count: countExpr,
      })
      .from(employees)
      .where(sql`${employees.terminationDate} is not null`)
      .groupBy(sql`substr(${employees.terminationDate}, 1, 7)`),
    db
      .select({ hireDate: employees.hireDate, terminationDate: employees.terminationDate })
      .from(employees),
  ]);

  const hiresMap = new Map(hiresByMonth.map((r) => [r.month, Number(r.count)]));
  const termsMap = new Map(termsByMonth.map((r) => [r.month, Number(r.count)]));

  const headcountTrend: HrDashboard['headcountTrend'] = [];
  const startTrend = new Date(`${fromMonth}-01T00:00:00Z`);
  const endTrend = new Date(`${toMonth}-01T00:00:00Z`);
  for (
    let cursor = new Date(startTrend);
    cursor <= endTrend;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const key = monthKey(cursor);
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const headcount = headcountSnapshot.filter((e) => {
      const hired = new Date(`${e.hireDate}T00:00:00Z`) <= monthEnd;
      const left = e.terminationDate
        ? new Date(`${e.terminationDate}T00:00:00Z`) < cursor
        : false;
      return hired && !left;
    }).length;
    headcountTrend.push({
      month: key,
      headcount,
      hires: hiresMap.get(key) ?? 0,
      terminations: termsMap.get(key) ?? 0,
    });
  }

  // Turnover rate over the window: terminations / average headcount, where the
  // average is taken across the trend's first and last point-in-time snapshots.
  const startHeadcount = headcountTrend.at(0)?.headcount ?? activeEmployees;
  const endHeadcount = headcountTrend.at(-1)?.headcount ?? activeEmployees;
  const avgHeadcount = (startHeadcount + endHeadcount) / 2 || activeEmployees || 1;
  const turnoverRate = round((terminationsInRange / avgHeadcount) * 100);

  const timeOffUtilization = await getTimeOffUtilization(db);
  const trainingComplianceRate = await getTrainingComplianceRate(db);

  const [pendingTimeOffRow] = await db
    .select({ count: countExpr })
    .from(timeOffRequests)
    .where(eq(timeOffRequests.status, 'pending'));
  const [pendingTimesheetsRow] = await db
    .select({ count: countExpr })
    .from(timesheets)
    .where(eq(timesheets.status, 'submitted'));
  const openRequisitionsByDepartment = toCategoryCounts(openReqRows);
  const openRequisitions = openRequisitionsByDepartment.reduce((a, b) => a + b.count, 0);

  return {
    filters: {
      from,
      to,
      department: filters.department ?? null,
      division: filters.division ?? null,
      location: filters.location ?? null,
      status: filters.status ?? null,
    },
    totalEmployees,
    activeEmployees,
    onLeave,
    terminated,
    openRequisitions,
    pendingTimeOff: Number(pendingTimeOffRow?.count ?? 0),
    pendingTimesheets: Number(pendingTimesheetsRow?.count ?? 0),
    newHiresThisMonth,
    hiresInRange,
    terminationsInRange,
    turnoverRate,
    avgTenureYears,
    trainingComplianceRate,
    headcountByDepartment: toCategoryCounts(byDepartment),
    headcountByDivision: toCategoryCounts(byDivision),
    headcountByLocation: toCategoryCounts(byLocation),
    headcountByStatus: toCategoryCounts(byStatus),
    headcountByEmploymentType: toCategoryCounts(byEmploymentType),
    genderDistribution: toCategoryCounts(byGender),
    tenureDistribution: TENURE_BUCKETS.map((b) => ({
      label: b.label,
      count: tenureCounts.get(b.label) ?? 0,
    })),
    headcountTrend,
    timeOffUtilization,
    openRequisitionsByDepartment,
  };
}

/** Aggregate accrued vs. used leave across all balances for the current year. */
async function getTimeOffUtilization(db: Database): Promise<HrDashboard['timeOffUtilization']> {
  const year = new Date().getUTCFullYear();
  const rows = await db
    .select({
      type: timeOffBalances.type,
      accrued: sql<number>`sum(${timeOffBalances.accruedDays})`,
      used: sql<number>`sum(${timeOffBalances.usedDays})`,
    })
    .from(timeOffBalances)
    .where(eq(timeOffBalances.year, year))
    .groupBy(timeOffBalances.type);

  const order = ACCRUAL_TIME_OFF_TYPES as readonly string[];
  return rows
    .map((r) => {
      const accruedDays = round(Number(r.accrued ?? 0), 1);
      const usedDays = round(Number(r.used ?? 0), 1);
      return {
        type: r.type,
        accruedDays,
        usedDays,
        utilizationRate: accruedDays > 0 ? round((usedDays / accruedDays) * 100) : 0,
      };
    })
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/**
 * Percentage of (active employee × required course) assignments that have been
 * completed. Treats every required course as assigned to every active employee.
 */
async function getTrainingComplianceRate(db: Database): Promise<number> {
  const [requiredRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(courses)
    .where(eq(courses.required, true));
  const requiredCount = Number(requiredRow?.count ?? 0);

  const [activeRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(eq(employees.status, 'active'));
  const activeCount = Number(activeRow?.count ?? 0);

  const denominator = requiredCount * activeCount;
  if (denominator === 0) return 100;

  const requiredCourses = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.required, true));
  const requiredIds = requiredCourses.map((c) => c.id);
  if (requiredIds.length === 0) return 100;

  const [completedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(courseEnrollments)
    .innerJoin(employees, eq(courseEnrollments.employeeId, employees.id))
    .where(
      and(
        eq(employees.status, 'active'),
        eq(courseEnrollments.status, 'completed'),
        inArray(courseEnrollments.courseId, requiredIds),
      ),
    );
  const completed = Number(completedRow?.count ?? 0);
  return round((completed / denominator) * 100);
}

export async function getTeamDashboard(
  db: Database,
  managerId: string,
): Promise<TeamDashboard> {
  const reports = await db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, status: employees.status })
    .from(employees)
    .where(eq(employees.managerId, managerId));

  if (reports.length === 0) {
    return {
      teamSize: 0,
      activeMembers: 0,
      onLeave: 0,
      pendingTimeOff: 0,
      pendingTimesheets: 0,
      pendingReviews: 0,
      activeGoals: 0,
      atRiskGoals: 0,
      trainingComplianceRate: 100,
      headcountByStatus: [],
      upcomingTimeOff: [],
    };
  }

  const reportIds = reports.map((r) => r.id);
  const nameById = new Map(reports.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));
  const today = isoDay(new Date());

  const countExpr = sql<number>`count(*)`;
  const [
    pendingTimeOffRow,
    pendingTimesheetsRow,
    pendingReviewRow,
    goalRows,
    upcoming,
    enrollmentRows,
    requiredCourses,
  ] = await Promise.all([
    db
      .select({ count: countExpr })
      .from(timeOffRequests)
      .where(and(inArray(timeOffRequests.employeeId, reportIds), eq(timeOffRequests.status, 'pending'))),
    db
      .select({ count: countExpr })
      .from(timesheets)
      .where(and(inArray(timesheets.employeeId, reportIds), eq(timesheets.status, 'submitted'))),
    db
      .select({ count: countExpr })
      .from(reviews)
      .where(and(inArray(reviews.employeeId, reportIds), eq(reviews.reviewerId, managerId))),
    db
      .select({ status: goals.status, count: countExpr })
      .from(goals)
      .where(inArray(goals.employeeId, reportIds))
      .groupBy(goals.status),
    db
      .select({
        employeeId: timeOffRequests.employeeId,
        type: timeOffRequests.type,
        startDate: timeOffRequests.startDate,
        endDate: timeOffRequests.endDate,
        totalDays: timeOffRequests.totalDays,
      })
      .from(timeOffRequests)
      .where(
        and(
          inArray(timeOffRequests.employeeId, reportIds),
          eq(timeOffRequests.status, 'approved'),
          gte(timeOffRequests.endDate, today),
        ),
      )
      .orderBy(timeOffRequests.startDate)
      .limit(10),
    db
      .select({
        employeeId: courseEnrollments.employeeId,
        courseId: courseEnrollments.courseId,
        status: courseEnrollments.status,
      })
      .from(courseEnrollments)
      .where(inArray(courseEnrollments.employeeId, reportIds)),
    db.select({ id: courses.id }).from(courses).where(eq(courses.required, true)),
  ]);

  const goalMap = new Map(goalRows.map((r) => [r.status, Number(r.count)]));
  const activeIds = new Set(reports.filter((r) => r.status === 'active').map((r) => r.id));
  const activeMembers = activeIds.size;
  const onLeave = reports.filter((r) => r.status === 'on_leave').length;

  const requiredIds = new Set(requiredCourses.map((c) => c.id));
  const completedRequired = enrollmentRows.filter(
    (e) => e.status === 'completed' && requiredIds.has(e.courseId) && activeIds.has(e.employeeId),
  ).length;
  const complianceDenominator = requiredIds.size * activeMembers;
  const trainingComplianceRate =
    complianceDenominator === 0 ? 100 : round((completedRequired / complianceDenominator) * 100);

  const statusCounts = new Map<string, number>();
  for (const r of reports) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);

  return {
    teamSize: reports.length,
    activeMembers,
    onLeave,
    pendingTimeOff: Number(pendingTimeOffRow[0]?.count ?? 0),
    pendingTimesheets: Number(pendingTimesheetsRow[0]?.count ?? 0),
    pendingReviews: Number(pendingReviewRow[0]?.count ?? 0),
    activeGoals: goalMap.get('active') ?? 0,
    atRiskGoals: goalMap.get('at_risk') ?? 0,
    trainingComplianceRate,
    headcountByStatus: toCategoryCounts(
      [...statusCounts.entries()].map(([label, count]) => ({ label, count })),
    ),
    upcomingTimeOff: upcoming.map((u) => ({
      employeeName: nameById.get(u.employeeId) ?? 'Unknown',
      type: u.type,
      startDate: u.startDate,
      endDate: u.endDate,
      totalDays: u.totalDays,
    })),
  };
}

const DATASET_HEADERS: Record<AnalyticsDataset, string[]> = {
  headcountByDepartment: ['Department', 'Headcount'],
  headcountByDivision: ['Division', 'Headcount'],
  headcountByLocation: ['Location', 'Headcount'],
  headcountByStatus: ['Status', 'Headcount'],
  headcountByEmploymentType: ['Employment Type', 'Headcount'],
  genderDistribution: ['Gender', 'Headcount'],
  tenureDistribution: ['Tenure', 'Headcount'],
  headcountTrend: ['Month', 'Headcount', 'Hires', 'Terminations'],
  timeOffUtilization: ['Type', 'Accrued Days', 'Used Days', 'Utilization %'],
  openRequisitionsByDepartment: ['Department', 'Open Requisitions'],
};

function csvCell(value: string | number): string {
  const str = String(value);
  return /[",\n]/u.test(str) ? `"${str.replace(/"/gu, '""')}"` : str;
}

function csvRows(dataset: AnalyticsDataset, dashboard: HrDashboard): (string | number)[][] {
  switch (dataset) {
    case 'headcountTrend':
      return dashboard.headcountTrend.map((p) => [p.month, p.headcount, p.hires, p.terminations]);
    case 'timeOffUtilization':
      return dashboard.timeOffUtilization.map((u) => [
        u.type,
        u.accruedDays,
        u.usedDays,
        u.utilizationRate,
      ]);
    default:
      return (dashboard[dataset] as CategoryCount[]).map((c) => [c.label, c.count]);
  }
}

/** Serialise one dashboard dataset to CSV text for download. */
export function dashboardDatasetToCsv(dataset: AnalyticsDataset, dashboard: HrDashboard): string {
  const lines = [DATASET_HEADERS[dataset], ...csvRows(dataset, dashboard)];
  return lines.map((row) => row.map(csvCell).join(',')).join('\n');
}

export async function getEmployeeDashboard(
  db: Database,
  employeeId: string,
): Promise<EmployeeDashboard> {
  const balances = await getBalances(db, employeeId);
  const vacation = balances.find((b) => b.type === 'vacation');

  const pending = (
    await db
      .select()
      .from(timeOffRequests)
      .where(
        and(eq(timeOffRequests.employeeId, employeeId), eq(timeOffRequests.status, 'pending')),
      )
  ).length;

  const holidays = await db
    .select()
    .from(companyHolidays)
    .orderBy(companyHolidays.date)
    .limit(50);
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = holidays
    .filter((h) => h.date >= todayIso)
    .slice(0, 3)
    .map((h) => ({ name: h.name, date: h.date }));

  const activeGoals = (
    await db
      .select()
      .from(goals)
      .where(and(eq(goals.employeeId, employeeId), eq(goals.status, 'active')))
  ).length;

  const unread = (
    await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.employeeId, employeeId), eq(notifications.read, false)))
  ).length;

  const requiredCourses = await db.select().from(courses).where(eq(courses.required, true));
  const myEnrollments = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.employeeId, employeeId));
  const completedRequired = new Set(
    myEnrollments.filter((e) => e.status === 'completed').map((e) => e.courseId),
  );
  const outstanding = requiredCourses.filter((c) => !completedRequired.has(c.id)).length;

  return {
    timeOffBalanceDays: vacation?.availableDays ?? 0,
    pendingRequests: pending,
    upcomingHolidays,
    activeGoals,
    onboardingPercent: null,
    unreadNotifications: unread,
    requiredCoursesOutstanding: outstanding,
  };
}
