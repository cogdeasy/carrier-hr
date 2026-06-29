import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviewCycles, reviews } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import { authHeader, createTestApp, login, seedUser, type SeededUser, type TestContext } from '../test/harness.js';

describe('performance review lifecycle', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;
  let cycleId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, {
      email: 'pmgr@carrier.com',
      roles: ['manager'],
      firstName: 'Pat',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, {
      email: 'pemp@carrier.com',
      roles: ['employee'],
      firstName: 'Sam',
      lastName: 'Subject',
      managerId: manager.employeeId,
    });
    cycleId = createId('cyc');
    await ctx.db.insert(reviewCycles).values({
      id: cycleId,
      name: 'Mid-Year Review 2026',
      status: 'active',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function seedReview(
    status: string,
    selfAssessment: string | null = null,
    reviewCycleId: string = cycleId,
  ): Promise<string> {
    const id = createId('rev');
    await ctx.db.insert(reviews).values({
      id,
      cycleId: reviewCycleId,
      employeeId: employee.employeeId,
      reviewerId: manager.employeeId,
      status,
      selfAssessment,
    });
    return id;
  }

  // A review is unique per (cycle, employee), so each seeded review gets its own
  // cycle to keep the lifecycle cases independent.
  async function seedCycle(name: string): Promise<string> {
    const id = createId('cyc');
    await ctx.db.insert(reviewCycles).values({
      id,
      name,
      status: 'active',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    return id;
  }

  it('exposes the cycle name on listed reviews', async () => {
    await seedReview('self_review');
    const token = await login(ctx.app, 'pemp@carrier.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/performance/reviews',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const review = (res.json() as { cycle?: { name: string } }[])[0];
    expect(review.cycle?.name).toBe('Mid-Year Review 2026');
  });

  it('walks the happy path self -> manager -> completed', async () => {
    const id = await seedReview('self_review', null, await seedCycle('Annual Review 2026'));
    const empToken = await login(ctx.app, 'pemp@carrier.com');
    const self = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/self`,
      headers: authHeader(empToken),
      payload: { selfAssessment: 'I did well.' },
    });
    expect(self.statusCode).toBe(200);
    expect(self.json().status).toBe('manager_review');

    const mgrToken = await login(ctx.app, 'pmgr@carrier.com');
    const mgr = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(mgrToken),
      payload: { managerAssessment: 'Strong year.', overallRating: 4 },
    });
    expect(mgr.statusCode).toBe(200);
    expect(mgr.json().status).toBe('completed');
  });

  it('rejects a self-assessment that would regress a completed review', async () => {
    const id = await seedReview('completed', 'original self', await seedCycle('Q1 Review 2026'));
    const empToken = await login(ctx.app, 'pemp@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/self`,
      headers: authHeader(empToken),
      payload: { selfAssessment: 'sneaky overwrite' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a manager re-submission on a completed review', async () => {
    const id = await seedReview('completed', 'submitted self', await seedCycle('Q2 Review 2026'));
    const mgrToken = await login(ctx.app, 'pmgr@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(mgrToken),
      payload: { managerAssessment: 'overwrite', overallRating: 1 },
    });
    expect(res.statusCode).toBe(400);
  });
});
