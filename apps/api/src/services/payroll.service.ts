import { desc, eq } from 'drizzle-orm';
import type { Compensation, Payslip } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { compensations, payslips } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import { toPayslip } from './mappers.js';

export async function listPayslips(db: Database, employeeId: string): Promise<Payslip[]> {
  const rows = await db
    .select()
    .from(payslips)
    .where(eq(payslips.employeeId, employeeId))
    .orderBy(desc(payslips.payDate));
  return rows.map(toPayslip);
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
  return toPayslip(row);
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
