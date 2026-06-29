import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type {
  AdminPayslipQuery,
  Compensation,
  CreatePayslipInput,
  EmployeeRef,
  GeneratePayRunInput,
  Paginated,
  PayFrequency,
  PayRun,
  PayRunDetail,
  Payslip,
  PayslipLine,
  PayslipQuery,
  YtdSummary,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { compensations, employees, payRuns, payslips } from '../db/schema.js';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { offset, paginate } from '../lib/pagination.js';
import { toEmployeeRef, toPayRun, toPayslip, type PayRunTotals } from './mappers.js';

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

// Statutory and benefit rates used to derive payslip lines for a pay run.
const RATES = {
  federalTax: 0.15,
  stateTax: 0.05,
  socialSecurity: 0.062,
  medicare: 0.0145,
  medicalPremium: 0.04,
  retirement401k: 0.05,
  employerMatch: 0.04,
  employerFica: 0.0765,
} as const;

function sortColumn(sort: PayslipQuery['sort']) {
  const desc_ = sort.startsWith('-');
  const field = desc_ ? sort.slice(1) : sort;
  const column = field === 'periodStart' ? payslips.periodStart : payslips.payDate;
  return desc_ ? desc(column) : asc(column);
}

function payslipFilters(filters: SQL[], q: { status?: string; frequency?: string; from?: string; to?: string; year?: number }): void {
  if (q.status) filters.push(eq(payslips.status, q.status));
  if (q.frequency) filters.push(eq(payslips.frequency, q.frequency));
  if (q.from) filters.push(gte(payslips.payDate, q.from));
  if (q.to) filters.push(lte(payslips.payDate, q.to));
  if (q.year) {
    filters.push(gte(payslips.payDate, `${q.year}-01-01`));
    filters.push(lte(payslips.payDate, `${q.year}-12-31`));
  }
}

export async function listPayslips(
  db: Database,
  employeeId: string,
  query: PayslipQuery,
): Promise<Paginated<Payslip>> {
  const filters: SQL[] = [eq(payslips.employeeId, employeeId)];
  payslipFilters(filters, query);
  const where = and(...filters);

  const totalRows = await db.select({ value: count() }).from(payslips).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(payslips)
    .where(where)
    .orderBy(sortColumn(query.sort))
    .limit(query.pageSize)
    .offset(offset(query.page, query.pageSize));

  return paginate(rows.map((r) => toPayslip(r)), total, query.page, query.pageSize);
}

export async function listAllPayslips(
  db: Database,
  query: AdminPayslipQuery,
): Promise<Paginated<Payslip>> {
  const filters: SQL[] = [];
  payslipFilters(filters, query);
  if (query.employeeId) filters.push(eq(payslips.employeeId, query.employeeId));
  if (query.payRunId) filters.push(eq(payslips.payRunId, query.payRunId));
  const where = filters.length ? and(...filters) : undefined;

  const totalRows = await db.select({ value: count() }).from(payslips).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(payslips)
    .where(where)
    .orderBy(sortColumn(query.sort))
    .limit(query.pageSize)
    .offset(offset(query.page, query.pageSize));

  const refs = await employeeRefMap(
    db,
    rows.map((r) => r.employeeId),
  );
  const data = rows.map((r) => toPayslip(r, { employee: refs.get(r.employeeId) }));
  return paginate(data, total, query.page, query.pageSize);
}

export async function getPayslip(
  db: Database,
  employeeId: string,
  id: string,
  options: { allowAny?: boolean } = {},
): Promise<Payslip> {
  const [row] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);
  if (!row) throw NotFound('Payslip not found');
  if (!options.allowAny && row.employeeId !== employeeId) throw NotFound('Payslip not found');
  const refs = await employeeRefMap(db, [row.employeeId]);
  return toPayslip(row, { employee: refs.get(row.employeeId) });
}

export async function getCompensation(
  db: Database,
  employeeId: string,
): Promise<Compensation | null> {
  const [row] = await db
    .select()
    .from(compensations)
    .where(eq(compensations.employeeId, employeeId))
    .orderBy(desc(compensations.effectiveDate))
    .limit(1);
  if (!row) return null;
  return {
    employeeId: row.employeeId,
    annualSalaryCents: row.annualSalaryCents,
    currency: row.currency,
    payFrequency: row.payFrequency as Compensation['payFrequency'],
    effectiveDate: row.effectiveDate,
  };
}

export async function getYtdSummary(
  db: Database,
  employeeId: string,
  year: number,
): Promise<YtdSummary> {
  const rows = await db
    .select()
    .from(payslips)
    .where(
      and(
        eq(payslips.employeeId, employeeId),
        gte(payslips.payDate, `${year}-01-01`),
        lte(payslips.payDate, `${year}-12-31`),
      ),
    );
  const summary: YtdSummary = {
    year,
    currency: rows[0]?.currency ?? 'USD',
    grossCents: 0,
    netCents: 0,
    totalTaxCents: 0,
    totalDeductionsCents: 0,
    totalContributionsCents: 0,
    payslipCount: rows.length,
  };
  for (const r of rows) {
    summary.grossCents += r.grossCents;
    summary.netCents += r.netCents;
    summary.totalTaxCents += r.totalTaxCents;
    summary.totalDeductionsCents += r.totalDeductionsCents;
    summary.totalContributionsCents += r.totalContributionsCents;
  }
  return summary;
}

interface FinancialBreakdown {
  grossCents: number;
  netCents: number;
  totalTaxCents: number;
  totalDeductionsCents: number;
  totalContributionsCents: number;
}

function summarizeLines(lines: PayslipLine[]): FinancialBreakdown {
  let grossCents = 0;
  let totalTaxCents = 0;
  let totalDeductionsCents = 0;
  let totalContributionsCents = 0;
  for (const line of lines) {
    if (line.type === 'earning') grossCents += line.amountCents;
    else if (line.type === 'tax') totalTaxCents += line.amountCents;
    else if (line.type === 'deduction') totalDeductionsCents += line.amountCents;
    else totalContributionsCents += line.amountCents;
  }
  const netCents = grossCents - totalTaxCents - totalDeductionsCents;
  if (netCents < 0) throw BadRequest('Net pay cannot be negative');
  return { grossCents, netCents, totalTaxCents, totalDeductionsCents, totalContributionsCents };
}

function buildStandardLines(grossCents: number): PayslipLine[] {
  const round = (rate: number) => Math.round(grossCents * rate);
  return [
    { label: 'Base Salary', type: 'earning', amountCents: grossCents },
    { label: 'Federal Income Tax', type: 'tax', amountCents: round(RATES.federalTax) },
    { label: 'State Income Tax', type: 'tax', amountCents: round(RATES.stateTax) },
    { label: 'Social Security', type: 'tax', amountCents: round(RATES.socialSecurity) },
    { label: 'Medicare', type: 'tax', amountCents: round(RATES.medicare) },
    { label: 'Medical Premium', type: 'deduction', amountCents: round(RATES.medicalPremium) },
    { label: '401(k) Contribution', type: 'deduction', amountCents: round(RATES.retirement401k) },
    { label: '401(k) Employer Match', type: 'contribution', amountCents: round(RATES.employerMatch) },
    { label: 'Employer FICA', type: 'contribution', amountCents: round(RATES.employerFica) },
  ];
}

export async function generatePayRun(
  db: Database,
  actorId: string,
  input: GeneratePayRunInput,
): Promise<PayRunDetail> {
  const compRows = await db.select().from(compensations);
  // Latest compensation per employee.
  const latestComp = new Map<string, (typeof compRows)[number]>();
  for (const c of [...compRows].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))) {
    latestComp.set(c.employeeId, c);
  }

  let targetIds = input.employeeIds ?? [...latestComp.keys()];
  if (input.employeeIds) {
    const valid = new Set(
      (
        await db
          .select({ id: employees.id })
          .from(employees)
          .where(inArray(employees.id, input.employeeIds))
      ).map((r) => r.id),
    );
    const missing = input.employeeIds.filter((id) => !valid.has(id));
    if (missing.length) throw NotFound(`Unknown employee(s): ${missing.join(', ')}`);
  }
  targetIds = targetIds.filter((id) => latestComp.has(id));
  if (targetIds.length === 0) {
    throw BadRequest('No employees with compensation records to pay in this run');
  }

  // Skip employees who already have a payslip covering this exact period.
  const existing = new Set(
    (
      await db
        .select({ employeeId: payslips.employeeId })
        .from(payslips)
        .where(
          and(
            inArray(payslips.employeeId, targetIds),
            eq(payslips.periodStart, input.periodStart),
            eq(payslips.periodEnd, input.periodEnd),
          ),
        )
    ).map((r) => r.employeeId),
  );
  const toPay = targetIds.filter((id) => !existing.has(id));
  if (toPay.length === 0) {
    throw Conflict('All selected employees already have a payslip for this period');
  }

  const payRunId = createId('prun');
  const currency = latestComp.get(toPay[0]!)?.currency ?? 'USD';
  await db.insert(payRuns).values({
    id: payRunId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    frequency: input.frequency,
    status: 'issued',
    currency,
    createdById: actorId,
  });

  for (const employeeId of toPay) {
    const comp = latestComp.get(employeeId)!;
    const grossCents = Math.round(comp.annualSalaryCents / PERIODS_PER_YEAR[input.frequency]);
    const lines = buildStandardLines(grossCents);
    const totals = summarizeLines(lines);
    await db.insert(payslips).values({
      id: createId('pay'),
      employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payDate: input.payDate,
      status: 'issued',
      frequency: input.frequency,
      currency: comp.currency,
      grossCents: totals.grossCents,
      netCents: totals.netCents,
      totalDeductionsCents: totals.totalDeductionsCents,
      totalTaxCents: totals.totalTaxCents,
      totalContributionsCents: totals.totalContributionsCents,
      payRunId,
      lines: JSON.stringify(lines),
    });
  }

  return getPayRun(db, payRunId);
}

export async function createPayslip(
  db: Database,
  input: CreatePayslipInput,
): Promise<Payslip> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!employee) throw NotFound('Employee not found');

  const [duplicate] = await db
    .select({ id: payslips.id })
    .from(payslips)
    .where(
      and(
        eq(payslips.employeeId, input.employeeId),
        eq(payslips.periodStart, input.periodStart),
        eq(payslips.periodEnd, input.periodEnd),
      ),
    )
    .limit(1);
  if (duplicate) throw Conflict('A payslip already exists for this employee and period');

  const totals = summarizeLines(input.lines);
  const id = createId('pay');
  await db.insert(payslips).values({
    id,
    employeeId: input.employeeId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    status: 'issued',
    frequency: input.frequency,
    currency: input.currency,
    grossCents: totals.grossCents,
    netCents: totals.netCents,
    totalDeductionsCents: totals.totalDeductionsCents,
    totalTaxCents: totals.totalTaxCents,
    totalContributionsCents: totals.totalContributionsCents,
    payRunId: null,
    lines: JSON.stringify(input.lines),
  });
  return getPayslip(db, input.employeeId, id, { allowAny: true });
}

export async function markPayslipPaid(db: Database, id: string): Promise<Payslip> {
  const [row] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);
  if (!row) throw NotFound('Payslip not found');
  if (row.status !== 'paid') {
    await db.update(payslips).set({ status: 'paid' }).where(eq(payslips.id, id));
  }
  return getPayslip(db, row.employeeId, id, { allowAny: true });
}

export async function deletePayslip(db: Database, id: string): Promise<void> {
  const [row] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);
  if (!row) throw NotFound('Payslip not found');
  if (row.status === 'paid') throw Conflict('Paid payslips cannot be deleted');
  await db.delete(payslips).where(eq(payslips.id, id));
}

export async function listPayRuns(
  db: Database,
  query: { page: number; pageSize: number; status?: string },
): Promise<Paginated<PayRun>> {
  const where = query.status ? eq(payRuns.status, query.status) : undefined;
  const totalRows = await db.select({ value: count() }).from(payRuns).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(payRuns)
    .where(where)
    .orderBy(desc(payRuns.payDate))
    .limit(query.pageSize)
    .offset(offset(query.page, query.pageSize));

  const totalsById = await payRunTotals(db, rows.map((r) => r.id));
  const data = rows.map((r) => toPayRun(r, totalsById.get(r.id) ?? emptyTotals()));
  return paginate(data, total, query.page, query.pageSize);
}

export async function getPayRun(db: Database, id: string): Promise<PayRunDetail> {
  const [row] = await db.select().from(payRuns).where(eq(payRuns.id, id)).limit(1);
  if (!row) throw NotFound('Pay run not found');

  const slipRows = await db
    .select()
    .from(payslips)
    .where(eq(payslips.payRunId, id))
    .orderBy(asc(payslips.employeeId));

  const refs = await employeeRefMap(db, slipRows.map((r) => r.employeeId));
  const slips = slipRows.map((r) => toPayslip(r, { employee: refs.get(r.employeeId) }));
  const totals: PayRunTotals = {
    payslipCount: slips.length,
    totalGrossCents: slips.reduce((s, p) => s + p.grossCents, 0),
    totalNetCents: slips.reduce((s, p) => s + p.netCents, 0),
  };
  return { ...toPayRun(row, totals), payslips: slips };
}

export async function markPayRunPaid(db: Database, id: string): Promise<PayRunDetail> {
  const [row] = await db.select().from(payRuns).where(eq(payRuns.id, id)).limit(1);
  if (!row) throw NotFound('Pay run not found');
  if (row.status !== 'paid') {
    await db.update(payslips).set({ status: 'paid' }).where(eq(payslips.payRunId, id));
    await db.update(payRuns).set({ status: 'paid' }).where(eq(payRuns.id, id));
  }
  return getPayRun(db, id);
}

async function employeeRefMap(db: Database, ids: string[]): Promise<Map<string, EmployeeRef>> {
  const map = new Map<string, EmployeeRef>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const rows = await db.select().from(employees).where(inArray(employees.id, unique));
  for (const row of rows) map.set(row.id, toEmployeeRef(row));
  return map;
}

function emptyTotals(): PayRunTotals {
  return { payslipCount: 0, totalGrossCents: 0, totalNetCents: 0 };
}

async function payRunTotals(db: Database, ids: string[]): Promise<Map<string, PayRunTotals>> {
  const map = new Map<string, PayRunTotals>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      payRunId: payslips.payRunId,
      payslipCount: count(),
      totalGrossCents: sql<number>`coalesce(sum(${payslips.grossCents}), 0)`,
      totalNetCents: sql<number>`coalesce(sum(${payslips.netCents}), 0)`,
    })
    .from(payslips)
    .where(inArray(payslips.payRunId, ids))
    .groupBy(payslips.payRunId);
  for (const r of rows) {
    if (!r.payRunId) continue;
    map.set(r.payRunId, {
      payslipCount: Number(r.payslipCount),
      totalGrossCents: Number(r.totalGrossCents),
      totalNetCents: Number(r.totalNetCents),
    });
  }
  return map;
}
