import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { employees, timeOffBalances, timeOffRequests } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

describe('time-off approval workflow', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, {
      email: 'mgr@collins.com',
      roles: ['manager'],
      firstName: 'Mary',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, {
      email: 'emp@collins.com',
      roles: ['employee'],
      firstName: 'Eli',
      lastName: 'Employee',
      managerId: manager.employeeId,
    });
    // Give the employee a vacation balance for the current year.
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: employee.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 0,
      year: new Date().getUTCFullYear(),
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lets an employee submit a request, routes it to the manager, and reflects approval in the balance', async () => {
    const empToken = await login(ctx.app, 'emp@collins.com');
    const year = new Date().getUTCFullYear();

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: {
        type: 'vacation',
        startDate: `${year}-08-10`,
        endDate: `${year}-08-14`,
        reason: 'Family trip',
      },
    });
    expect(created.statusCode).toBe(201);
    const requestId = created.json().id as string;
    expect(created.json().status).toBe('pending');
    expect(created.json().totalDays).toBeGreaterThan(0);

    // Manager sees it in their approvals queue.
    const mgrToken = await login(ctx.app, 'mgr@collins.com');
    const approvals = await ctx.app.inject({
      method: 'GET',
      url: '/api/time-off/approvals',
      headers: authHeader(mgrToken),
    });
    expect(approvals.statusCode).toBe(200);
    const queued = (approvals.json() as { id: string; employee?: { displayName: string } }[]).find(
      (r) => r.id === requestId,
    );
    expect(queued).toBeDefined();
    // The approvals queue must carry the real submitter identity, not a placeholder.
    expect(queued!.employee?.displayName).toBe('Eli Employee');

    // Manager approves.
    const decision = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${requestId}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved', decisionNote: 'Enjoy!' },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().status).toBe('approved');

    // Balance now reflects used days.
    const [balance] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, employee.employeeId));
    expect(balance!.usedDays).toBeGreaterThan(0);
  });

  it('accepts non-accrual leave (bereavement) without a seeded balance', async () => {
    // Regression: bereavement/jury_duty/parental have no accrual balance, so
    // they must not be rejected for "insufficient balance".
    const empToken = await login(ctx.app, 'emp@collins.com');
    const year = new Date().getUTCFullYear();
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: {
        type: 'bereavement',
        startDate: `${year}-11-02`,
        endDate: `${year}-11-04`,
        reason: 'Family bereavement',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe('pending');
    expect(created.json().type).toBe('bereavement');
  });

  it('prevents an employee from approving their own request', async () => {
    const empToken = await login(ctx.app, 'emp@collins.com');
    const year = new Date().getUTCFullYear();
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-09-01`, endDate: `${year}-09-02` },
    });
    const requestId = created.json().id as string;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${requestId}/decision`,
      headers: authHeader(empToken),
      payload: { decision: 'approved' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('prevents an approver from approving their own request even with approve permission', async () => {
    // A manager who is their own manager becomes the approver of their own
    // request, so this exercises the self-approval guard in decideRequest
    // rather than the route permission check.
    const year = new Date().getUTCFullYear();
    const selfMgr = await seedUser(ctx.db, { email: 'selfmgr@collins.com', roles: ['manager'] });
    await ctx.db
      .update(employees)
      .set({ managerId: selfMgr.employeeId })
      .where(eq(employees.id, selfMgr.employeeId));
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: selfMgr.employeeId,
      type: 'vacation',
      accruedDays: 10,
      usedDays: 0,
      year,
    });
    const token = await login(ctx.app, 'selfmgr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(token),
      payload: { type: 'vacation', startDate: `${year}-10-01`, endDate: `${year}-10-02` },
    });
    expect(created.statusCode).toBe(201);
    const requestId = created.json().id as string;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${requestId}/decision`,
      headers: authHeader(token),
      payload: { decision: 'approved' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain('your own');
  });
});

describe('time-off request edge cases', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;
  const year = new Date().getUTCFullYear() + 1;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, { email: 'edge.mgr@collins.com', roles: ['manager'] });
    employee = await seedUser(ctx.db, {
      email: 'edge.emp@collins.com',
      roles: ['employee'],
      firstName: 'Edge',
      lastName: 'Case',
      managerId: manager.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: employee.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 0,
      year,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects a request that overlaps an existing one (no double-booking)', async () => {
    const token = await login(ctx.app, 'edge.emp@collins.com');
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(token),
      payload: { type: 'vacation', startDate: `${year}-03-09`, endDate: `${year}-03-13` },
    });
    expect(first.statusCode).toBe(201);

    const overlap = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(token),
      payload: { type: 'vacation', startDate: `${year}-03-11`, endDate: `${year}-03-17` },
    });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.message).toMatch(/overlap/i);
  });

  it('guards against requesting more accrual days than are available', async () => {
    const lowBal = await seedUser(ctx.db, {
      email: 'lowbal@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: lowBal.employeeId,
      type: 'vacation',
      accruedDays: 2,
      usedDays: 0,
      year,
    });
    const token = await login(ctx.app, 'lowbal@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(token),
      payload: { type: 'vacation', startDate: `${year}-04-06`, endDate: `${year}-04-10` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/insufficient/i);
  });

  it('lets an employee cancel a pending request', async () => {
    const token = await login(ctx.app, 'edge.emp@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(token),
      payload: { type: 'vacation', startDate: `${year}-05-04`, endDate: `${year}-05-05` },
    });
    const id = created.json().id as string;
    const cancelled = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/cancel`,
      headers: authHeader(token),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');
  });

  it('refunds accrual when an upcoming approved request is cancelled', async () => {
    const empToken = await login(ctx.app, 'edge.emp@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-06-01`, endDate: `${year}-06-03` },
    });
    const id = created.json().id as string;
    const days = created.json().totalDays as number;

    const mgrToken = await login(ctx.app, 'edge.mgr@collins.com');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved' },
    });
    const [afterApprove] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, employee.employeeId));
    const usedAfterApprove = afterApprove!.usedDays;

    const cancelled = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/cancel`,
      headers: authHeader(empToken),
    });
    expect(cancelled.statusCode).toBe(200);
    const [afterCancel] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, employee.employeeId));
    expect(afterCancel!.usedDays).toBe(usedAfterApprove - days);
  });
});

describe('time-off approval authorization', () => {
  let ctx: TestContext;
  const year = new Date().getUTCFullYear() + 1;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('forbids a manager who is not the assigned approver from deciding', async () => {
    const approver = await seedUser(ctx.db, { email: 'real.approver@collins.com', roles: ['manager'] });
    const other = await seedUser(ctx.db, { email: 'other.mgr@collins.com', roles: ['manager'] });
    const emp = await seedUser(ctx.db, {
      email: 'reportee@collins.com',
      roles: ['employee'],
      managerId: approver.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: emp.employeeId,
      type: 'vacation',
      accruedDays: 10,
      usedDays: 0,
      year,
    });
    void other;

    const empToken = await login(ctx.app, 'reportee@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-07-06`, endDate: `${year}-07-07` },
    });
    const id = created.json().id as string;

    const otherToken = await login(ctx.app, 'other.mgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/decision`,
      headers: authHeader(otherToken),
      payload: { decision: 'approved' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('decrements accrual atomically across concurrent approvals', async () => {
    const mgr = await seedUser(ctx.db, { email: 'atomic.mgr@collins.com', roles: ['manager'] });
    const emp = await seedUser(ctx.db, {
      email: 'atomic.emp@collins.com',
      roles: ['employee'],
      managerId: mgr.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: emp.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 0,
      year,
    });
    const empToken = await login(ctx.app, 'atomic.emp@collins.com');
    const a = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-08-03`, endDate: `${year}-08-05` },
    });
    const b = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-08-10`, endDate: `${year}-08-12` },
    });
    const daysA = a.json().totalDays as number;
    const daysB = b.json().totalDays as number;

    const mgrToken = await login(ctx.app, 'atomic.mgr@collins.com');
    await Promise.all([
      ctx.app.inject({
        method: 'POST',
        url: `/api/time-off/requests/${a.json().id}/decision`,
        headers: authHeader(mgrToken),
        payload: { decision: 'approved' },
      }),
      ctx.app.inject({
        method: 'POST',
        url: `/api/time-off/requests/${b.json().id}/decision`,
        headers: authHeader(mgrToken),
        payload: { decision: 'approved' },
      }),
    ]);

    const [balance] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, emp.employeeId));
    expect(balance!.usedDays).toBe(daysA + daysB);
  });

  it('prevents concurrent approvals of different requests from overdrawing the balance', async () => {
    const mgr = await seedUser(ctx.db, { email: 'over.mgr@collins.com', roles: ['manager'] });
    const emp = await seedUser(ctx.db, {
      email: 'over.emp@collins.com',
      roles: ['employee'],
      managerId: mgr.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: emp.employeeId,
      type: 'vacation',
      accruedDays: 8,
      usedDays: 0,
      year,
    });
    // Seed two pending requests that together exceed the accrual. The
    // submission-time guard normally prevents this, so insert directly to
    // exercise the approval-time atomic reservation in isolation.
    const reqA = createId('tor');
    const reqB = createId('tor');
    await ctx.db.insert(timeOffRequests).values([
      {
        id: reqA,
        employeeId: emp.employeeId,
        type: 'vacation',
        startDate: `${year}-10-05`,
        endDate: `${year}-10-09`,
        totalDays: 5,
        status: 'pending',
        approverId: mgr.employeeId,
      },
      {
        id: reqB,
        employeeId: emp.employeeId,
        type: 'vacation',
        startDate: `${year}-10-12`,
        endDate: `${year}-10-16`,
        totalDays: 5,
        status: 'pending',
        approverId: mgr.employeeId,
      },
    ]);

    const mgrToken = await login(ctx.app, 'over.mgr@collins.com');
    const [resA, resB] = await Promise.all([
      ctx.app.inject({
        method: 'POST',
        url: `/api/time-off/requests/${reqA}/decision`,
        headers: authHeader(mgrToken),
        payload: { decision: 'approved' },
      }),
      ctx.app.inject({
        method: 'POST',
        url: `/api/time-off/requests/${reqB}/decision`,
        headers: authHeader(mgrToken),
        payload: { decision: 'approved' },
      }),
    ]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes).toEqual([200, 400]);

    const [balance] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, emp.employeeId));
    expect(balance!.usedDays).toBeLessThanOrEqual(8);
    expect(balance!.usedDays).toBe(5);
  });

  it('does not double-decrement when the same request is approved twice', async () => {
    const mgr = await seedUser(ctx.db, { email: 'dup.mgr@collins.com', roles: ['manager'] });
    const emp = await seedUser(ctx.db, {
      email: 'dup.emp@collins.com',
      roles: ['employee'],
      managerId: mgr.employeeId,
    });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: emp.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 0,
      year,
    });
    const empToken = await login(ctx.app, 'dup.emp@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-09-07`, endDate: `${year}-09-09` },
    });
    const id = created.json().id as string;
    const days = created.json().totalDays as number;

    const mgrToken = await login(ctx.app, 'dup.mgr@collins.com');
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved' },
    });
    expect(first.statusCode).toBe(200);

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/time-off/requests/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved' },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.message).toMatch(/already been decided/i);

    const [balance] = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, emp.employeeId));
    expect(balance!.usedDays).toBe(days);
  });
});

describe('time-off holidays and calendar', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;
  const year = new Date().getUTCFullYear() + 1;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, { email: 'cal.mgr@collins.com', roles: ['manager'] });
    employee = await seedUser(ctx.db, {
      email: 'cal.emp@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    await seedUser(ctx.db, { email: 'cal.hr@collins.com', roles: ['hr_admin'] });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: employee.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 0,
      year,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('forbids non-admins from creating company holidays', async () => {
    const token = await login(ctx.app, 'cal.emp@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/holidays',
      headers: authHeader(token),
      payload: { name: 'Test Day', date: `${year}-09-07`, region: 'US' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('excludes an HR-created holiday from the working-day count', async () => {
    const hrToken = await login(ctx.app, 'cal.hr@collins.com');
    const holiday = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/holidays',
      headers: authHeader(hrToken),
      payload: { name: 'Company Day', date: `${year}-09-09`, region: 'US' },
    });
    expect(holiday.statusCode).toBe(201);

    const empToken = await login(ctx.app, 'cal.emp@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-09-08`, endDate: `${year}-09-10` },
    });
    expect(created.statusCode).toBe(201);
    // Mon-Wed is 3 weekdays; the Tuesday holiday is excluded, leaving 2.
    expect(created.json().totalDays).toBe(2);
  });

  it('scopes the team calendar: a manager sees a report, an employee sees only themselves', async () => {
    const empToken = await login(ctx.app, 'cal.emp@collins.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/requests',
      headers: authHeader(empToken),
      payload: { type: 'vacation', startDate: `${year}-10-05`, endDate: `${year}-10-06` },
    });

    const mgrToken = await login(ctx.app, 'cal.mgr@collins.com');
    const mgrView = await ctx.app.inject({
      method: 'GET',
      url: `/api/time-off/calendar?from=${year}-10-01&to=${year}-10-31`,
      headers: authHeader(mgrToken),
    });
    expect(mgrView.statusCode).toBe(200);
    const mgrIds = (mgrView.json() as { employeeId: string }[]).map((r) => r.employeeId);
    expect(mgrIds).toContain(employee.employeeId);

    const other = await seedUser(ctx.db, { email: 'cal.other@collins.com', roles: ['employee'] });
    void other;
    const empView = await ctx.app.inject({
      method: 'GET',
      url: `/api/time-off/calendar?from=${year}-10-01&to=${year}-10-31`,
      headers: authHeader(empToken),
    });
    const empIds = (empView.json() as { employeeId: string }[]).map((r) => r.employeeId);
    expect(new Set(empIds)).toEqual(new Set([employee.employeeId]));
  });

  it('rolls accrual forward at year-end, capped by policy', async () => {
    const hrToken = await login(ctx.app, 'cal.hr@collins.com');
    const rollEmp = await seedUser(ctx.db, { email: 'roll.emp@collins.com', roles: ['employee'] });
    const sourceYear = 2099;
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: rollEmp.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 12,
      year: sourceYear,
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/carryover',
      headers: authHeader(hrToken),
      payload: { fromYear: sourceYear },
    });
    expect(res.statusCode).toBe(200);

    const rows = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, rollEmp.employeeId));
    const target = rows.find((r) => r.year === sourceYear + 1);
    // remaining = 8, capped at policy max (5), plus the 20-day annual accrual.
    expect(target).toBeDefined();
    expect(target!.accruedDays).toBe(25);
    expect(target!.usedDays).toBe(0);
  });

  it('preserves usedDays when carryover is re-run for an already-used target year', async () => {
    const hrToken = await login(ctx.app, 'cal.hr@collins.com');
    const reEmp = await seedUser(ctx.db, { email: 'rerun.emp@collins.com', roles: ['employee'] });
    const sourceYear = 2097;
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: reEmp.employeeId,
      type: 'vacation',
      accruedDays: 20,
      usedDays: 4,
      year: sourceYear,
    });
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/carryover',
      headers: authHeader(hrToken),
      payload: { fromYear: sourceYear },
    });
    expect(first.statusCode).toBe(200);

    // Employee takes leave in the new year before carryover is re-run.
    await ctx.db
      .update(timeOffBalances)
      .set({ usedDays: 3 })
      .where(
        and(
          eq(timeOffBalances.employeeId, reEmp.employeeId),
          eq(timeOffBalances.year, sourceYear + 1),
        ),
      );

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/time-off/carryover',
      headers: authHeader(hrToken),
      payload: { fromYear: sourceYear },
    });
    expect(second.statusCode).toBe(200);

    const rows = await ctx.db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, reEmp.employeeId));
    const target = rows.find((r) => r.year === sourceYear + 1);
    expect(target!.usedDays).toBe(3);
  });

  it('paginates request history', async () => {
    const pager = await seedUser(ctx.db, { email: 'pager@collins.com', roles: ['employee'] });
    await ctx.db.insert(timeOffBalances).values({
      id: createId('tob'),
      employeeId: pager.employeeId,
      type: 'vacation',
      accruedDays: 30,
      usedDays: 0,
      year,
    });
    const token = await login(ctx.app, 'pager@collins.com');
    for (const week of ['11-02', '11-09', '11-16']) {
      await ctx.app.inject({
        method: 'POST',
        url: '/api/time-off/requests',
        headers: authHeader(token),
        payload: { type: 'vacation', startDate: `${year}-${week}`, endDate: `${year}-${week}` },
      });
    }
    const page1 = await ctx.app.inject({
      method: 'GET',
      url: '/api/time-off/requests?page=1&pageSize=2',
      headers: authHeader(token),
    });
    expect(page1.statusCode).toBe(200);
    const body = page1.json() as { data: unknown[]; total: number; totalPages: number };
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.totalPages).toBe(2);

    const holidayUsedByCompanyDay = await ctx.app.inject({
      method: 'GET',
      url: '/api/time-off/requests?page=2&pageSize=2',
      headers: authHeader(token),
    });
    expect((holidayUsedByCompanyDay.json() as { data: unknown[] }).data).toHaveLength(1);
  });
});
