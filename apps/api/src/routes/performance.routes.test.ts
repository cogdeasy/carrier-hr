import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviewCycles, reviews } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import { authHeader, createTestApp, login, seedUser, type SeededUser, type TestContext } from '../test/harness.js';

// The auth route is rate-limited, so memoize tokens per email (each test user
// has a unique email) to avoid tripping the limiter when logging in repeatedly.
const tokenCache = new Map<string, Promise<string>>();
function authToken(app: FastifyInstance, email: string): Promise<string> {
  let cached = tokenCache.get(email);
  if (!cached) {
    cached = login(app, email);
    tokenCache.set(email, cached);
  }
  return cached;
}

describe('performance review lifecycle', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let employee: SeededUser;
  let cycleId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, {
      email: 'pmgr@collins.com',
      roles: ['manager'],
      firstName: 'Pat',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, {
      email: 'pemp@collins.com',
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
    const token = await authToken(ctx.app, 'pemp@collins.com');
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
    const empToken = await authToken(ctx.app, 'pemp@collins.com');
    const self = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/self`,
      headers: authHeader(empToken),
      payload: { selfAssessment: 'I did well.' },
    });
    expect(self.statusCode).toBe(200);
    expect(self.json().status).toBe('manager_review');

    const mgrToken = await authToken(ctx.app, 'pmgr@collins.com');
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
    const empToken = await authToken(ctx.app, 'pemp@collins.com');
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
    const mgrToken = await authToken(ctx.app, 'pmgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(mgrToken),
      payload: { managerAssessment: 'overwrite', overallRating: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks manager feedback before a self-assessment exists', async () => {
    const id = await seedReview('self_review', null, await seedCycle('Pre-self Review 2026'));
    const mgrToken = await authToken(ctx.app, 'pmgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(mgrToken),
      payload: { managerAssessment: 'early', overallRating: 3 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an out-of-range overall rating', async () => {
    const cyc = await seedCycle('Rating Review 2026');
    const id = await seedReview('manager_review', 'my self', cyc);
    const mgrToken = await authToken(ctx.app, 'pmgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(mgrToken),
      payload: { managerAssessment: 'ok', overallRating: 9 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids a non-reviewer from submitting manager feedback', async () => {
    const id = await seedReview('manager_review', 'my self', await seedCycle('Authz Review 2026'));
    const empToken = await authToken(ctx.app, 'pemp@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/reviews/${id}/manager`,
      headers: authHeader(empToken),
      payload: { managerAssessment: 'self-grade', overallRating: 5 },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('review cycles & enrollment', () => {
  let ctx: TestContext;
  let hr: SeededUser;
  let manager: SeededUser;
  let report: SeededUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    hr = await seedUser(ctx.db, { email: 'chr@collins.com', roles: ['hr_admin'] });
    manager = await seedUser(ctx.db, {
      email: 'cmgr@collins.com',
      roles: ['manager'],
    });
    report = await seedUser(ctx.db, {
      email: 'crep@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    void hr;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lets HR create a cycle but forbids employees', async () => {
    const hrToken = await authToken(ctx.app, 'chr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: authHeader(hrToken),
      payload: { name: 'EOY 2026', startDate: '2026-10-01', endDate: '2026-12-15' },
    });
    expect(created.statusCode).toBe(201);

    const empToken = await authToken(ctx.app, 'crep@collins.com');
    const forbidden = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: authHeader(empToken),
      payload: { name: 'Nope', startDate: '2026-10-01', endDate: '2026-12-15' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rejects a cycle whose end precedes its start', async () => {
    const hrToken = await authToken(ctx.app, 'chr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: authHeader(hrToken),
      payload: { name: 'Bad', startDate: '2026-12-01', endDate: '2026-01-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('enrolls employees with managers and skips re-enrollment', async () => {
    const hrToken = await authToken(ctx.app, 'chr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: authHeader(hrToken),
      payload: { name: 'Enroll 2026', startDate: '2026-06-01', endDate: '2026-06-30' },
    });
    const id = created.json().id as string;

    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/cycles/${id}/enroll`,
      headers: authHeader(hrToken),
      payload: { employeeIds: [report.employeeId, manager.employeeId] },
    });
    expect(first.statusCode).toBe(200);
    // Only the report has a manager, so the manager is skipped.
    expect(first.json().enrolled).toBe(1);

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/cycles/${id}/enroll`,
      headers: authHeader(hrToken),
      payload: { employeeIds: [report.employeeId] },
    });
    expect(second.json().enrolled).toBe(0);
    expect(second.json().skipped).toBe(1);
  });

  it('prevents reopening a closed cycle', async () => {
    const hrToken = await authToken(ctx.app, 'chr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: authHeader(hrToken),
      payload: { name: 'Closeable 2026', startDate: '2026-06-01', endDate: '2026-06-30', status: 'closed' },
    });
    const id = created.json().id as string;
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/cycles/${id}`,
      headers: authHeader(hrToken),
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('goals', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let report: SeededUser;
  let other: SeededUser;
  let admin: SeededUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, { email: 'gmgr@collins.com', roles: ['manager'] });
    report = await seedUser(ctx.db, {
      email: 'grep@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    other = await seedUser(ctx.db, { email: 'goth@collins.com', roles: ['employee'] });
    admin = await seedUser(ctx.db, { email: 'gadm@collins.com', roles: ['hr_admin'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createGoal(token: string, title = 'Ship the thing'): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/goals',
      headers: authHeader(token),
      payload: { title },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('auto-completes a goal when progress reaches 100', async () => {
    const token = await authToken(ctx.app, 'grep@collins.com');
    const id = await createGoal(token);
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { progress: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
    expect(res.json().progress).toBe(100);
  });

  it('auto-completes an at-risk goal when progress reaches 100', async () => {
    const token = await authToken(ctx.app, 'grep@collins.com');
    const id = await createGoal(token);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { status: 'at_risk' },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { progress: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('honors an explicit status change on a completed goal instead of re-completing it', async () => {
    const token = await authToken(ctx.app, 'grep@collins.com');
    const id = await createGoal(token);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { progress: 100 },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
  });

  it('lets an admin list goals across the whole org with scope=all', async () => {
    const repToken = await authToken(ctx.app, 'grep@collins.com');
    await createGoal(repToken, 'Org-wide visible goal');
    const adminToken = await authToken(ctx.app, 'gadm@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/performance/goals?scope=all',
      headers: authHeader(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    void admin;
  });

  it('forbids a non-admin from using scope=all', async () => {
    const token = await authToken(ctx.app, 'grep@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/performance/goals?scope=all',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects progress above 100', async () => {
    const token = await authToken(ctx.app, 'grep@collins.com');
    const id = await createGoal(token);
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(token),
      payload: { progress: 150 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids editing a goal you do not own', async () => {
    const ownerToken = await authToken(ctx.app, 'grep@collins.com');
    const id = await createGoal(ownerToken);
    const otherToken = await authToken(ctx.app, 'goth@collins.com');
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/goals/${id}`,
      headers: authHeader(otherToken),
      payload: { progress: 10 },
    });
    expect(res.statusCode).toBe(403);
    void other;
  });

  it('lets a manager view a direct report goals but not an unrelated employee', async () => {
    const repToken = await authToken(ctx.app, 'grep@collins.com');
    await createGoal(repToken, 'Report goal');
    const mgrToken = await authToken(ctx.app, 'gmgr@collins.com');
    const allowed = await ctx.app.inject({
      method: 'GET',
      url: `/api/performance/goals?employeeId=${report.employeeId}`,
      headers: authHeader(mgrToken),
    });
    expect(allowed.statusCode).toBe(200);
    expect(Array.isArray(allowed.json())).toBe(true);

    const denied = await ctx.app.inject({
      method: 'GET',
      url: `/api/performance/goals?employeeId=${other.employeeId}`,
      headers: authHeader(mgrToken),
    });
    expect(denied.statusCode).toBe(403);
    void manager;
  });
});

describe('1:1 meetings', () => {
  let ctx: TestContext;
  let manager: SeededUser;
  let report: SeededUser;
  let stranger: SeededUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await seedUser(ctx.db, { email: 'omgr@collins.com', roles: ['manager'] });
    report = await seedUser(ctx.db, {
      email: 'orep@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    stranger = await seedUser(ctx.db, { email: 'ostr@collins.com', roles: ['employee'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function schedule(): Promise<string> {
    const mgrToken = await authToken(ctx.app, 'omgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/one-on-ones',
      headers: authHeader(mgrToken),
      payload: { employeeId: report.employeeId, scheduledFor: '2026-07-01T15:00:00.000Z', agenda: 'Sync' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('lets a manager schedule a 1:1 with a direct report', async () => {
    const id = await schedule();
    expect(id).toBeTruthy();
  });

  it('forbids scheduling a 1:1 with a non-report', async () => {
    const mgrToken = await authToken(ctx.app, 'omgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/one-on-ones',
      headers: authHeader(mgrToken),
      payload: { employeeId: stranger.employeeId, scheduledFor: '2026-07-01T15:00:00.000Z' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('forbids an employee without review permission from scheduling', async () => {
    const empToken = await authToken(ctx.app, 'orep@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/performance/one-on-ones',
      headers: authHeader(empToken),
      payload: { employeeId: manager.employeeId, scheduledFor: '2026-07-01T15:00:00.000Z' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows both participants to edit notes but only the organiser to complete', async () => {
    const id = await schedule();
    const repToken = await authToken(ctx.app, 'orep@collins.com');
    const noteRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/one-on-ones/${id}`,
      headers: authHeader(repToken),
      payload: { notes: 'Talked about growth' },
    });
    expect(noteRes.statusCode).toBe(200);
    expect(noteRes.json().notes).toBe('Talked about growth');

    const completeRes = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/one-on-ones/${id}`,
      headers: authHeader(repToken),
      payload: { completed: true },
    });
    expect(completeRes.statusCode).toBe(403);
  });

  it('forbids a non-participant from viewing a meeting', async () => {
    const id = await schedule();
    const strangerToken = await authToken(ctx.app, 'ostr@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/performance/one-on-ones/${id}`,
      headers: authHeader(strangerToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('adds and toggles action items', async () => {
    const id = await schedule();
    const mgrToken = await authToken(ctx.app, 'omgr@collins.com');
    const add = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/one-on-ones/${id}/action-items`,
      headers: authHeader(mgrToken),
      payload: { title: 'Draft plan', assigneeId: report.employeeId },
    });
    expect(add.statusCode).toBe(201);
    const items = add.json().actionItems as { id: string; completed: boolean }[];
    expect(items).toHaveLength(1);

    const toggle = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/performance/action-items/${items[0]!.id}`,
      headers: authHeader(mgrToken),
      payload: { completed: true },
    });
    expect(toggle.statusCode).toBe(200);
    const toggled = (toggle.json().actionItems as { completed: boolean }[])[0];
    expect(toggled.completed).toBe(true);
  });

  it('rejects an action item assigned to a non-participant', async () => {
    const id = await schedule();
    const mgrToken = await authToken(ctx.app, 'omgr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/performance/one-on-ones/${id}/action-items`,
      headers: authHeader(mgrToken),
      payload: { title: 'Bad assignee', assigneeId: stranger.employeeId },
    });
    expect(res.statusCode).toBe(400);
  });
});
