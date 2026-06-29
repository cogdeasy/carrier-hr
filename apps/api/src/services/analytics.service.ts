import { and, eq } from 'drizzle-orm';
import type { EmployeeDashboard, HrDashboard } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  companyHolidays,
  courseEnrollments,
  courses,
  employees,
  goals,
  jobRequisitions,
  notifications,
  timeOffRequests,
  timesheets,
} from '../db/schema.js';
import { getBalances } from './timeoff.service.js';

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getHrDashboard(db: Database): Promise<HrDashboard> {
  const allEmployees = await db.select().from(employees);
  const active = allEmployees.filter((e) => e.status === 'active');
  const onLeave = allEmployees.filter((e) => e.status === 'on_leave');

  const now = new Date();
  const thisMonth = monthKey(now);
  const newHires = allEmployees.filter((e) => e.hireDate.slice(0, 7) === thisMonth);

  const terminatedThisYear = allEmployees.filter(
    (e) => e.terminationDate && e.terminationDate.slice(0, 4) === String(now.getUTCFullYear()),
  );
  const attritionRate =
    active.length > 0
      ? Math.round((terminatedThisYear.length / (active.length + terminatedThisYear.length)) * 1000) /
        10
      : 0;

  const tenures = active.map((e) => {
    const hire = new Date(`${e.hireDate}T00:00:00Z`);
    return (now.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000);
  });
  const avgTenureYears =
    tenures.length > 0
      ? Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10
      : 0;

  const deptMap = new Map<string, number>();
  const locMap = new Map<string, number>();
  for (const e of active) {
    deptMap.set(e.department, (deptMap.get(e.department) ?? 0) + 1);
    locMap.set(e.location, (locMap.get(e.location) ?? 0) + 1);
  }

  const genderMap = new Map<string, number>();
  for (const e of active) {
    const key = e.gender ?? 'Undisclosed';
    genderMap.set(key, (genderMap.get(key) ?? 0) + 1);
  }

  // 12-month headcount trend derived from hire/termination dates.
  const trend: HrDashboard['headcountTrend'] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0));
    const key = monthKey(monthDate);
    const headcount = allEmployees.filter((e) => {
      const hired = new Date(`${e.hireDate}T00:00:00Z`) <= monthEnd;
      const left = e.terminationDate
        ? new Date(`${e.terminationDate}T00:00:00Z`) < monthDate
        : false;
      return hired && !left;
    }).length;
    const hires = allEmployees.filter((e) => e.hireDate.slice(0, 7) === key).length;
    const attrition = allEmployees.filter(
      (e) => e.terminationDate && e.terminationDate.slice(0, 7) === key,
    ).length;
    trend.push({ month: key, headcount, hires, attrition });
  }

  const pendingTimeOff = (
    await db.select().from(timeOffRequests).where(eq(timeOffRequests.status, 'pending'))
  ).length;
  const pendingTimesheets = (
    await db.select().from(timesheets).where(eq(timesheets.status, 'submitted'))
  ).length;
  const openReqs = (
    await db.select().from(jobRequisitions).where(eq(jobRequisitions.status, 'open'))
  ).length;

  return {
    totalEmployees: allEmployees.length,
    activeEmployees: active.length,
    onLeave: onLeave.length,
    openRequisitions: openReqs,
    pendingTimeOff,
    pendingTimesheets,
    newHiresThisMonth: newHires.length,
    attritionRate,
    avgTenureYears,
    headcountByDepartment: [...deptMap.entries()]
      .map(([department, c]) => ({ department, count: c }))
      .sort((a, b) => b.count - a.count),
    headcountByLocation: [...locMap.entries()]
      .map(([location, c]) => ({ location, count: c }))
      .sort((a, b) => b.count - a.count),
    headcountTrend: trend,
    genderDistribution: [...genderMap.entries()].map(([label, c]) => ({ label, count: c })),
  };
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
