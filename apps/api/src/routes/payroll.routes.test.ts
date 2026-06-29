import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { compensations, payslips } from '../db/schema.js';
import { createId } from '../lib/ids.js';

interface SeededPayslip {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
}

async function seedPayslip(
  ctx: TestContext,
  employeeId: string,
  overrides: Partial<{
    periodStart: string;
    periodEnd: string;
    payDate: string;
    status: string;
    grossCents: number;
  }> = {},
): Promise<SeededPayslip> {
  const id = createId('pay');
  const periodStart = overrides.periodStart ?? '2026-01-01';
  const periodEnd = overrides.periodEnd ?? '2026-01-14';
  const gross = overrides.grossCents ?? 500000;
  const tax = 110000;
  const deductions = 40000;
  await ctx.db.insert(payslips).values({
    id,
    employeeId,
    periodStart,
    periodEnd,
    payDate: overrides.payDate ?? periodEnd,
    status: overrides.status ?? 'issued',
    frequency: 'biweekly',
    currency: 'USD',
    grossCents: gross,
    netCents: gross - tax - deductions,
    totalDeductionsCents: deductions,
    totalTaxCents: tax,
    totalContributionsCents: 38000,
    payRunId: null,
    lines: JSON.stringify([
      { label: 'Base Salary', type: 'earning', amountCents: gross },
      { label: 'Federal Income Tax', type: 'tax', amountCents: tax },
      { label: 'Medical Premium', type: 'deduction', amountCents: deductions },
    ]),
  });
  return { id, employeeId, periodStart, periodEnd };
}

describe('payroll', () => {
  let ctx: TestContext;
  let alice: { employeeId: string };
  let bob: { employeeId: string };
  let aliceToken: string;
  let bobToken: string;
  let hrToken: string;
  let mgrToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await seedUser(ctx.db, { email: 'pay.alice@collins.com', roles: ['employee'] });
    bob = await seedUser(ctx.db, { email: 'pay.bob@collins.com', roles: ['employee'] });
    await seedUser(ctx.db, { email: 'pay.hr@collins.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'pay.mgr@collins.com', roles: ['manager'], managerId: null });

    await ctx.db.insert(compensations).values({
      id: createId('cmp'),
      employeeId: alice.employeeId,
      annualSalaryCents: 13_000_000,
      currency: 'USD',
      payFrequency: 'biweekly',
      effectiveDate: '2024-01-01',
    });
    await ctx.db.insert(compensations).values({
      id: createId('cmp'),
      employeeId: bob.employeeId,
      annualSalaryCents: 10_400_000,
      currency: 'USD',
      payFrequency: 'biweekly',
      effectiveDate: '2024-01-01',
    });

    aliceToken = await login(ctx.app, 'pay.alice@collins.com');
    bobToken = await login(ctx.app, 'pay.bob@collins.com');
    hrToken = await login(ctx.app, 'pay.hr@collins.com');
    mgrToken = await login(ctx.app, 'pay.mgr@collins.com');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists only the requesting employee’s payslips', async () => {
    await seedPayslip(ctx, alice.employeeId, { periodStart: '2026-02-01', periodEnd: '2026-02-14' });
    await seedPayslip(ctx, bob.employeeId, { periodStart: '2026-02-01', periodEnd: '2026-02-14' });

    const token = aliceToken;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/payroll/payslips',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.every((p: { employeeId: string }) => p.employeeId === alice.employeeId)).toBe(
      true,
    );
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('forbids an employee from reading another employee’s payslip', async () => {
    const slip = await seedPayslip(ctx, bob.employeeId, {
      periodStart: '2026-03-01',
      periodEnd: '2026-03-14',
    });
    const token = aliceToken;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/payroll/payslips/${slip.id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(404);
  });

  it('lets HR read any employee’s payslip', async () => {
    const slip = await seedPayslip(ctx, bob.employeeId, {
      periodStart: '2026-04-01',
      periodEnd: '2026-04-14',
    });
    const token = hrToken;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/payroll/payslips/${slip.id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().employee.displayName).toBeTruthy();
  });

  it('denies pay-run generation to non-admins', async () => {
    const token = mgrToken;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/pay-runs',
      headers: authHeader(token),
      payload: { periodStart: '2026-05-01', periodEnd: '2026-05-14', payDate: '2026-05-15' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('denies the admin payslip list to plain employees', async () => {
    const token = aliceToken;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/payroll/admin/payslips',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('generates a pay run with net = gross − taxes − deductions and skips contributions', async () => {
    const token = hrToken;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/pay-runs',
      headers: authHeader(token),
      payload: {
        periodStart: '2026-06-01',
        periodEnd: '2026-06-14',
        payDate: '2026-06-15',
        frequency: 'biweekly',
        employeeIds: [alice.employeeId],
      },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json();
    expect(run.payslipCount).toBe(1);

    const slip = run.payslips[0];
    expect(slip.grossCents).toBe(Math.round(13_000_000 / 26));
    expect(slip.netCents).toBe(slip.grossCents - slip.totalTaxCents - slip.totalDeductionsCents);
    expect(slip.totalContributionsCents).toBeGreaterThan(0);
    // Employer contributions are informational and excluded from net pay.
    expect(slip.netCents).toBeLessThan(slip.grossCents);
    expect(run.totalNetCents).toBe(slip.netCents);
  });

  it('skips employees already paid for the period when generating again', async () => {
    const token = hrToken;
    const payload = {
      periodStart: '2026-07-01',
      periodEnd: '2026-07-14',
      payDate: '2026-07-15',
      frequency: 'biweekly' as const,
    };

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/pay-runs',
      headers: authHeader(token),
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstCount = first.json().payslipCount;
    expect(firstCount).toBeGreaterThanOrEqual(2);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/pay-runs',
      headers: authHeader(token),
      payload,
    });
    // Every employee was already paid for this period.
    expect(second.statusCode).toBe(409);
  });

  it('rejects a duplicate manual payslip for the same employee and period', async () => {
    const token = hrToken;
    const payload = {
      employeeId: alice.employeeId,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-14',
      payDate: '2026-08-15',
      frequency: 'biweekly' as const,
      lines: [
        { label: 'Base Salary', type: 'earning', amountCents: 500000 },
        { label: 'Federal Income Tax', type: 'tax', amountCents: 90000 },
      ],
    };

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/admin/payslips',
      headers: authHeader(token),
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().netCents).toBe(410000);

    const dup = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/admin/payslips',
      headers: authHeader(token),
      payload,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('rejects a manual payslip whose deductions exceed gross', async () => {
    const token = hrToken;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/admin/payslips',
      headers: authHeader(token),
      payload: {
        employeeId: bob.employeeId,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-14',
        payDate: '2026-09-15',
        lines: [
          { label: 'Base Salary', type: 'earning', amountCents: 100000 },
          { label: 'Federal Income Tax', type: 'tax', amountCents: 150000 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('marks a pay run and its payslips paid', async () => {
    const token = hrToken;
    const gen = await ctx.app.inject({
      method: 'POST',
      url: '/api/payroll/pay-runs',
      headers: authHeader(token),
      payload: {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-14',
        payDate: '2026-10-15',
        frequency: 'biweekly',
        employeeIds: [bob.employeeId],
      },
    });
    const runId = gen.json().id;

    const paid = await ctx.app.inject({
      method: 'POST',
      url: `/api/payroll/pay-runs/${runId}/pay`,
      headers: authHeader(token),
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().status).toBe('paid');
    expect(paid.json().payslips.every((p: { status: string }) => p.status === 'paid')).toBe(true);
  });

  it('aggregates year-to-date totals for the employee', async () => {
    const token = bobToken;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/payroll/ytd?year=2026',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const ytd = res.json();
    expect(ytd.year).toBe(2026);
    expect(ytd.payslipCount).toBeGreaterThanOrEqual(1);
    expect(ytd.grossCents).toBeGreaterThan(0);
    expect(ytd.netCents).toBe(ytd.grossCents - ytd.totalTaxCents - ytd.totalDeductionsCents);
  });
});
