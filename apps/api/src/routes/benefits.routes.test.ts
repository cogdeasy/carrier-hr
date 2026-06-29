import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  BenefitEnrollment,
  BenefitPlan,
  CostSummary,
  Dependent,
  EnrollmentEligibility,
  PaginatedEnrollments,
  QualifyingLifeEvent,
} from '@collins-hr/shared';
import {
  benefitDependents,
  benefitEnrollments,
  benefitPlanTiers,
  benefitPlans,
  enrollmentPeriods,
  qualifyingLifeEvents,
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

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function isoDateTime(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

describe('benefits enrollment', () => {
  let ctx: TestContext;
  let employee: SeededUser;
  let other: SeededUser;
  let hr: SeededUser;
  let token: string;
  let otherToken: string;
  let hrToken: string;
  let medicalId: string;
  let dentalId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    employee = await seedUser(ctx.db, { email: 'ben.emp@collins.com', roles: ['employee'] });
    other = await seedUser(ctx.db, { email: 'ben.other@collins.com', roles: ['employee'] });
    hr = await seedUser(ctx.db, { email: 'ben.hr@collins.com', roles: ['hr_admin'] });
    token = await login(ctx.app, employee.email);
    otherToken = await login(ctx.app, other.email);
    hrToken = await login(ctx.app, hr.email);

    medicalId = createId('plan');
    dentalId = createId('plan');
    await ctx.db.insert(benefitPlans).values([
      {
        id: medicalId,
        type: 'medical',
        name: 'Collins PPO Premier',
        carrier: 'UnitedHealthcare',
        description: 'Comprehensive PPO.',
        monthlyPremiumCents: 50000,
        employerContributionCents: 40000,
        coverageLevel: 'Employee + Family',
        planYear: 2026,
      },
      {
        id: dentalId,
        type: 'dental',
        name: 'Delta Dental PPO',
        carrier: 'Delta Dental',
        description: 'Dental coverage.',
        monthlyPremiumCents: 4800,
        employerContributionCents: 3600,
        coverageLevel: 'Employee Only',
        planYear: 2026,
      },
    ]);
    await ctx.db.insert(benefitPlanTiers).values([
      {
        id: createId('tier'),
        planId: medicalId,
        tier: 'employee_only',
        monthlyPremiumCents: 50000,
        employerContributionCents: 40000,
      },
      {
        id: createId('tier'),
        planId: medicalId,
        tier: 'family',
        monthlyPremiumCents: 140000,
        employerContributionCents: 112000,
      },
      {
        id: createId('tier'),
        planId: dentalId,
        tier: 'employee_only',
        monthlyPremiumCents: 4800,
        employerContributionCents: 3600,
      },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Each case controls the enrollment window / life events from a clean slate.
  beforeEach(async () => {
    await ctx.db.delete(benefitEnrollments);
    await ctx.db.delete(enrollmentPeriods);
    await ctx.db.delete(qualifyingLifeEvents);
    await ctx.db.delete(benefitDependents);
  });

  async function openWindow(): Promise<void> {
    await ctx.db.insert(enrollmentPeriods).values({
      id: createId('oep'),
      name: '2026 Open Enrollment',
      planYear: 2026,
      startsAt: isoDateTime(-10),
      endsAt: isoDateTime(10),
    });
  }

  async function addDependent(auth: string, overrides: Record<string, unknown> = {}): Promise<Dependent> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/dependents',
      headers: authHeader(auth),
      payload: {
        firstName: 'Jamie',
        lastName: 'Doe',
        relationship: 'spouse',
        dateOfBirth: '1990-01-01',
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as Dependent;
  }

  it('lists plans with per-tier pricing', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/plans',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const plans = res.json() as BenefitPlan[];
    const medical = plans.find((p) => p.id === medicalId)!;
    expect(medical.tiers).toHaveLength(2);
    expect(medical.tiers.find((t) => t.tier === 'family')?.monthlyPremiumCents).toBe(140000);
  });

  it('reports eligibility from the open enrollment window', async () => {
    let res = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/eligibility',
      headers: authHeader(token),
    });
    expect((res.json() as EnrollmentEligibility).canEnroll).toBe(false);

    await openWindow();
    res = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/eligibility',
      headers: authHeader(token),
    });
    const eligibility = res.json() as EnrollmentEligibility;
    expect(eligibility.canEnroll).toBe(true);
    expect(eligibility.reason).toBe('open_enrollment');
  });

  it('enrolls during open enrollment and computes employee cost', async () => {
    await openWindow();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only' },
    });
    expect(res.statusCode).toBe(200);
    const enrollment = res.json() as BenefitEnrollment;
    expect(enrollment.employeeCostCents).toBe(10000);
    expect(enrollment.coverageState).toBe('pending');
    expect(enrollment.qleId).toBeNull();
  });

  it('blocks enrollment when the window is closed and no life event applies', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows enrollment outside the window with an approved life event (QLE override)', async () => {
    const qleId = createId('qle');
    await ctx.db.insert(qualifyingLifeEvents).values({
      id: qleId,
      employeeId: employee.employeeId,
      type: 'marriage',
      eventDate: isoDate(-3),
      status: 'approved',
      windowEndsAt: isoDate(27),
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only', qleId },
    });
    expect(res.statusCode).toBe(200);
    const enrollment = res.json() as BenefitEnrollment;
    expect(enrollment.qleId).toBe(qleId);
    expect(enrollment.coverageState).toBe('current');
    expect(enrollment.effectiveDate).toBe(isoDate(-3));
  });

  it('enrolls with a specific older life event when a newer approved event also exists', async () => {
    const olderQleId = createId('qle');
    const newerQleId = createId('qle');
    await ctx.db.insert(qualifyingLifeEvents).values([
      {
        id: olderQleId,
        employeeId: employee.employeeId,
        type: 'marriage',
        eventDate: isoDate(-20),
        status: 'approved',
        windowEndsAt: isoDate(10),
      },
      {
        id: newerQleId,
        employeeId: employee.employeeId,
        type: 'birth',
        eventDate: isoDate(-2),
        status: 'approved',
        windowEndsAt: isoDate(28),
      },
    ]);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only', qleId: olderQleId },
    });
    expect(res.statusCode).toBe(200);
    const enrollment = res.json() as BenefitEnrollment;
    expect(enrollment.qleId).toBe(olderQleId);
    expect(enrollment.effectiveDate).toBe(isoDate(-20));
  });

  it('rejects a life event whose special-enrollment window has expired', async () => {
    const qleId = createId('qle');
    await ctx.db.insert(qualifyingLifeEvents).values({
      id: qleId,
      employeeId: employee.employeeId,
      type: 'marriage',
      eventDate: isoDate(-60),
      status: 'approved',
      windowEndsAt: isoDate(-30),
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only', qleId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires dependents for a family coverage tier', async () => {
    await openWindow();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'family', dependentIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects enrolling with a dependent that belongs to another employee', async () => {
    await openWindow();
    const stranger = await addDependent(otherToken);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: {
        planId: medicalId,
        status: 'enrolled',
        coverageTier: 'family',
        dependentIds: [stranger.id],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('enrolls a family tier with an owned dependent and reflects the count', async () => {
    await openWindow();
    const dep = await addDependent(token);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: {
        planId: medicalId,
        status: 'enrolled',
        coverageTier: 'family',
        dependentIds: [dep.id],
      },
    });
    expect(res.statusCode).toBe(200);
    const enrollment = res.json() as BenefitEnrollment;
    expect(enrollment.coverageTier).toBe('family');
    expect(enrollment.dependents).toBe(1);
    expect(enrollment.employeeCostCents).toBe(28000);
  });

  it('blocks deleting a dependent that is covered by an active election', async () => {
    await openWindow();
    const dep = await addDependent(token);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'family', dependentIds: [dep.id] },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/benefits/dependents/${dep.id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it('summarises cost per paycheck across enrolled plans', async () => {
    await openWindow();
    for (const planId of [medicalId, dentalId]) {
      await ctx.app.inject({
        method: 'POST',
        url: '/api/benefits/enrollments',
        headers: authHeader(token),
        payload: { planId, status: 'enrolled', coverageTier: 'employee_only' },
      });
    }
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/summary',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const summary = res.json() as CostSummary;
    expect(summary.monthlyEmployeeCents).toBe(11200);
    expect(summary.annualEmployeeCents).toBe(134400);
    expect(summary.perPaycheckEmployeeCents).toBe(Math.round(134400 / 26));
    expect(summary.items).toHaveLength(2);
  });

  it('scopes enrollments to the authenticated employee', async () => {
    await openWindow();
    await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only' },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/enrollments',
      headers: authHeader(otherToken),
    });
    expect((res.json() as BenefitEnrollment[]).length).toBe(0);
  });

  it('runs the life-event review workflow and unlocks enrollment', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/life-events',
      headers: authHeader(token),
      payload: { type: 'birth', eventDate: isoDate(-2) },
    });
    expect(createRes.statusCode).toBe(201);
    const event = createRes.json() as QualifyingLifeEvent;
    expect(event.status).toBe('pending');

    // Employees cannot review their own life event.
    const denied = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/benefits/admin/life-events/${event.id}`,
      headers: authHeader(token),
      payload: { status: 'approved' },
    });
    expect(denied.statusCode).toBe(403);

    const approve = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/benefits/admin/life-events/${event.id}`,
      headers: authHeader(hrToken),
      payload: { status: 'approved' },
    });
    expect(approve.statusCode).toBe(200);
    expect((approve.json() as QualifyingLifeEvent).status).toBe('approved');

    const enroll = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only', qleId: event.id },
    });
    expect(enroll.statusCode).toBe(200);
  });

  it('prevents an HR admin from approving their own life event', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/life-events',
      headers: authHeader(hrToken),
      payload: { type: 'marriage', eventDate: isoDate(-1) },
    });
    expect(createRes.statusCode).toBe(201);
    const event = createRes.json() as QualifyingLifeEvent;

    const selfApprove = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/benefits/admin/life-events/${event.id}`,
      headers: authHeader(hrToken),
      payload: { status: 'approved' },
    });
    expect(selfApprove.statusCode).toBe(403);
  });

  it('enforces RBAC on the HR admin enrollment view', async () => {
    await openWindow();
    await ctx.app.inject({
      method: 'POST',
      url: '/api/benefits/enrollments',
      headers: authHeader(token),
      payload: { planId: medicalId, status: 'enrolled', coverageTier: 'employee_only' },
    });

    const forbidden = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/admin/enrollments',
      headers: authHeader(token),
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await ctx.app.inject({
      method: 'GET',
      url: '/api/benefits/admin/enrollments',
      headers: authHeader(hrToken),
      query: { type: 'medical', pageSize: '10' },
    });
    expect(ok.statusCode).toBe(200);
    const page = ok.json() as PaginatedEnrollments;
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.items.every((i) => i.plan?.type === 'medical')).toBe(true);
    expect(page.items[0]?.employeeName).toBeTruthy();
  });
});
