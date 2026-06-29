import { z } from 'zod';
import { PAYSLIP_STATUSES, PAY_FREQUENCIES } from '../enums.js';
import { dateString } from './common.js';

export const compensationSchema = z.object({
  employeeId: z.string(),
  annualSalaryCents: z.number().int(),
  currency: z.string().length(3),
  payFrequency: z.enum(PAY_FREQUENCIES),
  effectiveDate: dateString,
});
export type Compensation = z.infer<typeof compensationSchema>;

export const payslipLineSchema = z.object({
  label: z.string(),
  type: z.enum(['earning', 'deduction', 'tax', 'contribution']),
  amountCents: z.number().int(),
});
export type PayslipLine = z.infer<typeof payslipLineSchema>;

export const payslipSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  periodStart: dateString,
  periodEnd: dateString,
  payDate: dateString,
  status: z.enum(PAYSLIP_STATUSES),
  currency: z.string().length(3),
  grossCents: z.number().int(),
  netCents: z.number().int(),
  totalDeductionsCents: z.number().int(),
  totalTaxCents: z.number().int(),
  lines: z.array(payslipLineSchema),
  createdAt: z.string(),
});
export type Payslip = z.infer<typeof payslipSchema>;
