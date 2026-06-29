import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createId } from '../lib/ids.js';
import { timeOffRequests } from '../db/schema.js';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

/** Monday of the current week, in UTC, as YYYY-MM-DD. */
function currentMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Monday `weeks` weeks before the current one (always in the past). */
function pastMonday(weeks: number): string {
  const d = new Date(`${currentMonday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('timesheets & attendance', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;
  let otherManager: SeededUser;
  let otherEmployee: SeededUser;
  let empToken: string;
  let mgrToken: string;
  let otherMgrToken: string;
  let otherEmpToken: string;
  const week = pastMonday(1);

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, {
      email: 'ts.mgr@collins.com',
      roles: ['manager'],
      firstName: 'Mary',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, {
      email: 'ts.emp@collins.com',
      roles: ['employee'],
      firstName: 'Eli',
      lastName: 'Employee',
      managerId: manager.employeeId,
    });
    otherManager = await seedUser(ctx.db, {
      email: 'ts.mgr2@collins.com',
      roles: ['manager'],
      firstName: 'Olga',
      lastName: 'Other',
    });
    otherEmployee = await seedUser(ctx.db, {
      email: 'ts.emp2@collins.com',
      roles: ['employee'],
      firstName: 'Ned',
      lastName: 'NotMine',
      managerId: otherManager.employeeId,
    });

    empToken = await login(ctx.app, 'ts.emp@collins.com');
    mgrToken = await login(ctx.app, 'ts.mgr@collins.com');
    otherMgrToken = await login(ctx.app, 'ts.mgr2@collins.com');
    otherEmpToken = await login(ctx.app, 'ts.emp2@collins.com');
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function saveWeek(
    token: string,
    weekStarting: string,
    entries: { date: string; project: string; hours: number; task?: string }[],
  ) {
    return ctx.app.inject({
      method: 'PUT',
      url: '/api/timesheets',
      headers: authHeader(token),
      payload: { weekStarting, entries },
    });
  }

  it('runs the full draft → submitted → approved lifecycle and routes to the manager', async () => {

    const saved = await saveWeek(empToken, week, [
      { date: week, project: 'Avionics', task: 'Integration', hours: 8 },
      { date: addDays(week, 1), project: 'Avionics', hours: 9 },
    ]);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().status).toBe('draft');
    expect(saved.json().totalHours).toBe(17);
    expect(saved.json().entries[0].task).toBe('Integration');
    const id = saved.json().id as string;

    const submitted = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().status).toBe('submitted');

    const queue = await ctx.app.inject({
      method: 'GET',
      url: '/api/timesheets/approvals',
      headers: authHeader(mgrToken),
    });
    expect(queue.statusCode).toBe(200);
    const queued = (queue.json() as { id: string; employee?: { displayName: string } }[]).find(
      (t) => t.id === id,
    );
    expect(queued).toBeDefined();
    expect(queued?.employee?.displayName).toBe('Eli Employee');

    const decided = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved' },
    });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().status).toBe('approved');
    expect(decided.json().overtimeHours).toBe(0);
  });

  it('blocks editing/submitting an approved sheet but allows resubmission after rejection', async () => {
    const wk = pastMonday(2);
    const saved = await saveWeek(empToken, wk, [{ date: wk, project: 'Wiring', hours: 6 }]);
    const id = saved.json().id as string;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });

    const rejected = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'rejected', decisionNote: 'Please add task detail' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    // Rejected sheet is editable and can be resubmitted.
    const reEdit = await saveWeek(empToken, wk, [
      { date: wk, project: 'Wiring', task: 'Harness', hours: 7 },
    ]);
    expect(reEdit.statusCode).toBe(200);
    expect(reEdit.json().status).toBe('draft');
    const resubmit = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });
    expect(resubmit.statusCode).toBe(200);
    expect(resubmit.json().status).toBe('submitted');

    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'approved' },
    });
    const editApproved = await saveWeek(empToken, wk, [{ date: wk, project: 'Wiring', hours: 1 }]);
    expect(editApproved.statusCode).toBe(400);
  });

  it('requires a comment when rejecting', async () => {
    const wk = pastMonday(3);
    const saved = await saveWeek(empToken, wk, [{ date: wk, project: 'QA', hours: 4 }]);
    const id = saved.json().id as string;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/decision`,
      headers: authHeader(mgrToken),
      payload: { decision: 'rejected' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('enforces hour and week-shape validation', async () => {
    const wk = pastMonday(4);

    // > 24h in a single day across rows.
    const tooMuch = await saveWeek(empToken, wk, [
      { date: wk, project: 'A', hours: 20 },
      { date: wk, project: 'B', hours: 6 },
    ]);
    expect(tooMuch.statusCode).toBe(400);

    // Entry outside the week.
    const outside = await saveWeek(empToken, wk, [
      { date: addDays(wk, 9), project: 'A', hours: 4 },
    ]);
    expect(outside.statusCode).toBe(400);

    // Non-Monday week start.
    const notMonday = await saveWeek(empToken, addDays(wk, 1), [
      { date: addDays(wk, 1), project: 'A', hours: 4 },
    ]);
    expect(notMonday.statusCode).toBe(400);
  });

  it('rejects submitting an empty timesheet', async () => {
    const wk = pastMonday(5);
    const created = await ctx.app.inject({
      method: 'GET',
      url: `/api/timesheets/week/${wk}`,
      headers: authHeader(empToken),
    });
    const id = created.json().id as string;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks submission that overlaps approved time off', async () => {
    const wk = pastMonday(6);
    await ctx.db.insert(timeOffRequests).values({
      id: createId('tor'),
      employeeId: employee.employeeId,
      type: 'vacation',
      startDate: wk,
      endDate: addDays(wk, 2),
      totalDays: 3,
      status: 'approved',
    });
    const saved = await saveWeek(empToken, wk, [{ date: wk, project: 'Avionics', hours: 8 }]);
    const id = saved.json().id as string;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/time off/i);
  });

  it('scopes approvals to direct reports and forbids deciding out-of-scope sheets', async () => {
    const wk = pastMonday(7);
    const saved = await saveWeek(empToken, wk, [{ date: wk, project: 'Avionics', hours: 5 }]);
    const id = saved.json().id as string;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/submit`,
      headers: authHeader(empToken),
    });

    // A manager of a different team cannot see or decide it.
    const queue = await ctx.app.inject({
      method: 'GET',
      url: '/api/timesheets/approvals',
      headers: authHeader(otherMgrToken),
    });
    expect((queue.json() as { id: string }[]).some((t) => t.id === id)).toBe(false);

    const forbidden = await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${id}/decision`,
      headers: authHeader(otherMgrToken),
      payload: { decision: 'approved' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('forbids an employee from reaching the approvals queue', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/timesheets/approvals',
      headers: authHeader(empToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('bulk-approves only in-scope submitted sheets', async () => {
    const wk = pastMonday(8);

    const mine = await saveWeek(empToken, wk, [{ date: wk, project: 'Avionics', hours: 8 }]);
    const mineId = mine.json().id as string;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${mineId}/submit`,
      headers: authHeader(empToken),
    });

    const theirs = await saveWeek(otherEmpToken, wk, [{ date: wk, project: 'Wiring', hours: 8 }]);
    const theirId = theirs.json().id as string;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/timesheets/${theirId}/submit`,
      headers: authHeader(otherEmpToken),
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/timesheets/approvals/bulk',
      headers: authHeader(mgrToken),
      payload: { ids: [mineId, theirId] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().approved).toEqual([mineId]);
    expect(res.json().skipped).toEqual([theirId]);
  });

  it('paginates the employee history and computes an attendance summary with overtime', async () => {
    const otWeek = pastMonday(9);
    await saveWeek(empToken, otWeek, [
      { date: otWeek, project: 'Avionics', hours: 12 },
      { date: addDays(otWeek, 1), project: 'Avionics', hours: 12 },
      { date: addDays(otWeek, 2), project: 'Avionics', hours: 12 },
      { date: addDays(otWeek, 3), project: 'Avionics', hours: 12 },
    ]);

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/timesheets?page=1&pageSize=3',
      headers: authHeader(empToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.length).toBeLessThanOrEqual(3);
    expect(list.json().total).toBeGreaterThan(0);

    const summary = await ctx.app.inject({
      method: 'GET',
      url: '/api/timesheets/summary',
      headers: authHeader(empToken),
    });
    expect(summary.statusCode).toBe(200);
    const otEntry = (summary.json().weeks as { weekStarting: string; overtimeHours: number }[]).find(
      (w) => w.weekStarting === otWeek,
    );
    expect(otEntry?.overtimeHours).toBe(8);
    expect(summary.json().overtimeHours).toBeGreaterThanOrEqual(8);

    // A manager can read a direct report's summary; an unrelated employee cannot.
    const mgrView = await ctx.app.inject({
      method: 'GET',
      url: `/api/timesheets/summary?employeeId=${employee.employeeId}`,
      headers: authHeader(mgrToken),
    });
    expect(mgrView.statusCode).toBe(200);

    const denied = await ctx.app.inject({
      method: 'GET',
      url: `/api/timesheets/summary?employeeId=${employee.employeeId}`,
      headers: authHeader(otherEmpToken),
    });
    expect(denied.statusCode).toBe(403);
    void otherEmployee;
  });
});
