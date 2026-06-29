import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { timeOffBalances } from '../db/schema.js';
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
      email: 'mgr@carrier.com',
      roles: ['manager'],
      firstName: 'Mary',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, {
      email: 'emp@carrier.com',
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
    const empToken = await login(ctx.app, 'emp@carrier.com');
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
    const mgrToken = await login(ctx.app, 'mgr@carrier.com');
    const approvals = await ctx.app.inject({
      method: 'GET',
      url: '/api/time-off/approvals',
      headers: authHeader(mgrToken),
    });
    expect(approvals.statusCode).toBe(200);
    expect(approvals.json().some((r: { id: string }) => r.id === requestId)).toBe(true);

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

  it('prevents an employee from approving their own request', async () => {
    const empToken = await login(ctx.app, 'emp@carrier.com');
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
});
