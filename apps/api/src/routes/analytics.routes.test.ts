import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  courseEnrollments,
  courses,
  employees,
  goals,
  jobRequisitions,
  reviewCycles,
  reviews,
  timeOffBalances,
  timeOffRequests,
  timesheets,
} from '../db/schema.js';
import { createId } from '../lib/ids.js';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

interface DataEmployee {
  department?: string;
  division?: string;
  location?: string;
  employmentType?: string;
  status?: string;
  gender?: string | null;
  hireDate?: string;
  terminationDate?: string | null;
  managerId?: string | null;
}

let counter = 0;
async function addEmployee(ctx: TestContext, e: DataEmployee): Promise<string> {
  counter += 1;
  const id = createId('emp');
  await ctx.db.insert(employees).values({
    id,
    employeeNumber: `T${counter}`,
    firstName: 'Data',
    lastName: `Emp${counter}`,
    email: `data.emp${counter}@collins.com`,
    jobTitle: 'Analyst',
    department: e.department ?? 'Flight Sciences',
    division: e.division ?? 'Avionics',
    location: e.location ?? 'Cedar Rapids, IA',
    employmentType: e.employmentType ?? 'full_time',
    status: e.status ?? 'active',
    gender: e.gender === undefined ? 'Male' : e.gender,
    hireDate: e.hireDate ?? '2020-01-01',
    terminationDate: e.terminationDate ?? null,
    managerId: e.managerId ?? null,
  });
  return id;
}

describe('analytics: org-wide HR dashboard', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr@collins.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'worker@collins.com', roles: ['employee'] });

    // Controlled population in a unique department so distributions are
    // deterministic when filtered by `department=Flight Sciences`.
    await addEmployee(ctx, { gender: 'Male', hireDate: '2020-01-01' });
    await addEmployee(ctx, { gender: 'Female', hireDate: '2024-02-01' });
    await addEmployee(ctx, { gender: 'Male', employmentType: 'part_time', hireDate: '2023-01-01' });
    await addEmployee(ctx, { gender: 'Female', hireDate: '2019-06-01' });
    await addEmployee(ctx, { gender: 'Female', status: 'on_leave', hireDate: '2018-01-01' });
    await addEmployee(ctx, {
      gender: 'Male',
      status: 'terminated',
      hireDate: '2017-01-01',
      terminationDate: '2024-06-15',
    });

    await ctx.db.insert(jobRequisitions).values([
      {
        id: createId('job'),
        title: 'Avionics Engineer',
        department: 'Flight Sciences',
        location: 'Cedar Rapids, IA',
        status: 'open',
        description: 'x',
      },
      {
        id: createId('job'),
        title: 'Recruiter',
        department: 'Human Resources',
        location: 'Charlotte, NC',
        status: 'closed',
        description: 'x',
      },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('denies access to users without analytics:read', async () => {
    const token = await login(ctx.app, 'worker@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('aggregates the filtered population correctly', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr?department=Flight%20Sciences',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.totalEmployees).toBe(6);
    expect(body.activeEmployees).toBe(4);
    expect(body.onLeave).toBe(1);
    expect(body.terminated).toBe(1);

    expect(body.headcountByDepartment).toEqual([{ label: 'Flight Sciences', count: 6 }]);

    const gender = Object.fromEntries(
      body.genderDistribution.map((g: { label: string; count: number }) => [g.label, g.count]),
    );
    expect(gender).toEqual({ Male: 3, Female: 3 });

    const empType = Object.fromEntries(
      body.headcountByEmploymentType.map((g: { label: string; count: number }) => [
        g.label,
        g.count,
      ]),
    );
    expect(empType).toEqual({ full_time: 5, part_time: 1 });

    // Tenure distribution only counts active employees.
    const tenureTotal = body.tenureDistribution.reduce(
      (sum: number, b: { count: number }) => sum + b.count,
      0,
    );
    expect(tenureTotal).toBe(4);

    expect(body.openRequisitions).toBe(1);
    expect(body.openRequisitionsByDepartment).toEqual([
      { label: 'Flight Sciences', count: 1 },
    ]);
  });

  it('filters hires and terminations by date range', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr?from=2024-01-01&to=2024-12-31',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Only the 2024-02 hire and the 2024-06 termination fall in range; the
    // harness/login employees were hired in 2022.
    expect(body.hiresInRange).toBe(1);
    expect(body.terminationsInRange).toBe(1);
    expect(body.filters.from).toBe('2024-01-01');
    expect(body.filters.to).toBe('2024-12-31');
  });

  it('rejects an inverted date range', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr?from=2024-12-31&to=2024-01-01',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it('exports a dataset as CSV', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr/export?dataset=headcountByDepartment&department=Flight%20Sciences',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('headcountByDepartment.csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('Department,Headcount');
    expect(lines).toContain('Flight Sciences,6');
  });

  it('rejects an unknown export dataset', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr/export?dataset=bogus',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('analytics: training compliance and time-off utilization', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await seedUser(ctx.db, { email: 'hr2@collins.com', roles: ['hr_admin'] });
    const second = await addEmployee(ctx, { status: 'active' });
    const year = new Date().getUTCFullYear();

    const courseA = createId('crs');
    const courseB = createId('crs');
    await ctx.db.insert(courses).values([
      { id: courseA, title: 'Ethics', category: 'compliance', description: 'x', required: true },
      { id: courseB, title: 'Safety', category: 'compliance', description: 'x', required: true },
    ]);
    // admin completes both; the second active employee completes one.
    await ctx.db.insert(courseEnrollments).values([
      { id: createId('enr'), employeeId: admin.employeeId, courseId: courseA, status: 'completed' },
      { id: createId('enr'), employeeId: admin.employeeId, courseId: courseB, status: 'completed' },
      { id: createId('enr'), employeeId: second, courseId: courseA, status: 'completed' },
      { id: createId('enr'), employeeId: second, courseId: courseB, status: 'in_progress' },
    ]);

    await ctx.db.insert(timeOffBalances).values([
      { id: createId('tob'), employeeId: admin.employeeId, type: 'vacation', accruedDays: 20, usedDays: 5, year },
      { id: createId('tob'), employeeId: second, type: 'vacation', accruedDays: 20, usedDays: 5, year },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('computes training compliance across active employees', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr',
      headers: authHeader(token),
    });
    const body = res.json();
    // 2 required courses × 2 active employees = 4 assignments; 3 completed.
    expect(body.trainingComplianceRate).toBe(75);
  });

  it('computes time-off utilization per type', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/hr',
      headers: authHeader(token),
    });
    const body = res.json();
    const vacation = body.timeOffUtilization.find(
      (u: { type: string }) => u.type === 'vacation',
    );
    expect(vacation).toMatchObject({ accruedDays: 40, usedDays: 10, utilizationRate: 25 });
  });
});

describe('analytics: team dashboard scoping', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let otherManager: SeededUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, { email: 'mgr@collins.com', roles: ['manager'] });
    otherManager = await seedUser(ctx.db, { email: 'mgr2@collins.com', roles: ['manager'] });
    await seedUser(ctx.db, { email: 'ic@collins.com', roles: ['employee'] });
    const hr = await seedUser(ctx.db, { email: 'hr3@collins.com', roles: ['hr_admin'] });
    void hr;

    const r1 = await addEmployee(ctx, { managerId: manager.employeeId, status: 'active' });
    const r2 = await addEmployee(ctx, { managerId: manager.employeeId, status: 'on_leave' });
    await addEmployee(ctx, { managerId: otherManager.employeeId, status: 'active' });

    const cycle = createId('cyc');
    await ctx.db.insert(reviewCycles).values({
      id: cycle,
      name: 'H1',
      status: 'active',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    await ctx.db.insert(reviews).values({
      id: createId('rev'),
      cycleId: cycle,
      employeeId: r1,
      reviewerId: manager.employeeId,
      status: 'manager_review',
    });
    await ctx.db.insert(goals).values([
      { id: createId('gol'), employeeId: r1, title: 'G1', status: 'active' },
      { id: createId('gol'), employeeId: r2, title: 'G2', status: 'at_risk' },
    ]);
    await ctx.db.insert(timeOffRequests).values([
      {
        id: createId('tor'),
        employeeId: r1,
        type: 'vacation',
        startDate: '2099-08-01',
        endDate: '2099-08-05',
        totalDays: 5,
        status: 'approved',
      },
      {
        id: createId('tor'),
        employeeId: r2,
        type: 'sick',
        startDate: '2099-09-01',
        endDate: '2099-09-02',
        totalDays: 2,
        status: 'pending',
      },
    ]);
    await ctx.db.insert(timesheets).values({
      id: createId('tms'),
      employeeId: r2,
      weekStarting: '2026-06-01',
      status: 'submitted',
    });
    const reqA = createId('crs');
    const reqB = createId('crs');
    await ctx.db.insert(courses).values([
      { id: reqA, title: 'Ethics', category: 'compliance', description: 'x', required: true },
      { id: reqB, title: 'Safety', category: 'compliance', description: 'x', required: true },
    ]);
    await ctx.db.insert(courseEnrollments).values([
      { id: createId('enr'), employeeId: r1, courseId: reqA, status: 'completed' },
      { id: createId('enr'), employeeId: r1, courseId: reqB, status: 'in_progress' },
      { id: createId('enr'), employeeId: r2, courseId: reqA, status: 'completed' },
      { id: createId('enr'), employeeId: r2, courseId: reqB, status: 'completed' },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('scopes the team dashboard to the manager direct reports', async () => {
    const token = await login(ctx.app, 'mgr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/team',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.teamSize).toBe(2);
    expect(body.activeMembers).toBe(1);
    expect(body.onLeave).toBe(1);
    expect(body.pendingReviews).toBe(1);
    expect(body.activeGoals).toBe(1);
    expect(body.atRiskGoals).toBe(1);
    expect(body.pendingTimeOff).toBe(1);
    expect(body.pendingTimesheets).toBe(1);
    expect(body.upcomingTimeOff).toHaveLength(1);
    // on-leave member completions are excluded; 1 of 2 required done by the lone active report.
    expect(body.trainingComplianceRate).toBe(50);
  });

  it('forbids employees without team analytics permission', async () => {
    const token = await login(ctx.app, 'ic@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/team',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('prevents a manager from viewing another manager team', async () => {
    const token = await login(ctx.app, 'mgr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics/team?managerId=${otherManager.employeeId}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows an HR admin to inspect any manager team', async () => {
    const token = await login(ctx.app, 'hr3@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics/team?managerId=${manager.employeeId}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().teamSize).toBe(2);
  });
});
