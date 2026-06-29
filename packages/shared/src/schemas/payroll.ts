import { z } from 'zod';
import { PAYSLIP_STATUSES, PAY_FREQUENCIES } from '../enums.js';
import { dateString, paginatedSchema } from './common.js';
import { employeeRefSchema } from './employee.js';

export const PAYSLIP_LINE_TYPES = ['earning', 'deduction', 'tax', 'contribution'] as const;
export type PayslipLineType = (typeof PAYSLIP_LINE_TYPES)[number];

export const PAY_RUN_STATUSES = ['draft', 'issued', 'paid'] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

export const compensationSchema = z.object({
  employeeId: z.string(),
  annualSalaryCents: z.number().int(),
  currency: z.string().length(3),
  payFrequency: z.enum(PAY_FREQUENCIES),
  effectiveDate: dateString,
});
export type Compensation = z.infer<typeof compensationSchema>;

export const payslipLineSchema = z.object({
  label: z.string().min(1),
  type: z.enum(PAYSLIP_LINE_TYPES),
  amountCents: z.number().int().nonnegative(),
});
export type PayslipLine = z.infer<typeof payslipLineSchema>;

export const payslipSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  periodStart: dateString,
  periodEnd: dateString,
  payDate: dateString,
  status: z.enum(PAYSLIP_STATUSES),
  frequency: z.enum(PAY_FREQUENCIES),
  currency: z.string().length(3),
  grossCents: z.number().int().nonnegative(),
  netCents: z.number().int().nonnegative(),
  totalDeductionsCents: z.number().int().nonnegative(),
  totalTaxCents: z.number().int().nonnegative(),
  totalContributionsCents: z.number().int().nonnegative(),
  payRunId: z.string().nullable(),
  lines: z.array(payslipLineSchema),
  createdAt: z.string(),
  employee: employeeRefSchema.optional(),
});
export type Payslip = z.infer<typeof payslipSchema>;

export const payslipListSchema = paginatedSchema(payslipSchema);
export type PayslipList = z.infer<typeof payslipListSchema>;

export const ytdSummarySchema = z.object({
  year: z.number().int(),
  currency: z.string().length(3),
  grossCents: z.number().int().nonnegative(),
  netCents: z.number().int().nonnegative(),
  totalTaxCents: z.number().int().nonnegative(),
  totalDeductionsCents: z.number().int().nonnegative(),
  totalContributionsCents: z.number().int().nonnegative(),
  payslipCount: z.number().int().nonnegative(),
});
export type YtdSummary = z.infer<typeof ytdSummarySchema>;

export const payRunSchema = z.object({
  id: z.string(),
  periodStart: dateString,
  periodEnd: dateString,
  payDate: dateString,
  frequency: z.enum(PAY_FREQUENCIES),
  status: z.enum(PAY_RUN_STATUSES),
  currency: z.string().length(3),
  payslipCount: z.number().int().nonnegative(),
  totalGrossCents: z.number().int().nonnegative(),
  totalNetCents: z.number().int().nonnegative(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
});
export type PayRun = z.infer<typeof payRunSchema>;

export const payRunDetailSchema = payRunSchema.extend({
  payslips: z.array(payslipSchema),
});
export type PayRunDetail = z.infer<typeof payRunDetailSchema>;

export const payRunListSchema = paginatedSchema(payRunSchema);
export type PayRunList = z.infer<typeof payRunListSchema>;

const payslipSortFields = ['payDate', '-payDate', 'periodStart', '-periodStart'] as const;
export type PayslipSort = (typeof payslipSortFields)[number];

export const payslipQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PAYSLIP_STATUSES).optional(),
  frequency: z.enum(PAY_FREQUENCIES).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  year: z.coerce.number().int().min(1970).max(9999).optional(),
  sort: z.enum(payslipSortFields).default('-payDate'),
});
export type PayslipQuery = z.infer<typeof payslipQuerySchema>;

export const adminPayslipQuerySchema = payslipQuerySchema.extend({
  employeeId: z.string().optional(),
  payRunId: z.string().optional(),
});
export type AdminPayslipQuery = z.infer<typeof adminPayslipQuerySchema>;

export const payRunQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PAY_RUN_STATUSES).optional(),
});
export type PayRunQuery = z.infer<typeof payRunQuerySchema>;

export const ytdQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(9999).optional(),
});
export type YtdQuery = z.infer<typeof ytdQuerySchema>;

const periodRefinement = (
  value: { periodStart: string; periodEnd: string; payDate: string },
  ctx: z.RefinementCtx,
) => {
  if (value.periodEnd < value.periodStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodEnd must be on or after periodStart',
      path: ['periodEnd'],
    });
  }
  if (value.payDate < value.periodStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'payDate must be on or after periodStart',
      path: ['payDate'],
    });
  }
};

export const generatePayRunSchema = z
  .object({
    periodStart: dateString,
    periodEnd: dateString,
    payDate: dateString,
    frequency: z.enum(PAY_FREQUENCIES).default('biweekly'),
    employeeIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine(periodRefinement);
export type GeneratePayRunInput = z.infer<typeof generatePayRunSchema>;

export const createPayslipSchema = z
  .object({
    employeeId: z.string().min(1),
    periodStart: dateString,
    periodEnd: dateString,
    payDate: dateString,
    frequency: z.enum(PAY_FREQUENCIES).default('biweekly'),
    currency: z.string().length(3).default('USD'),
    lines: z.array(payslipLineSchema).min(1),
  })
  .superRefine((value, ctx) => {
    periodRefinement(value, ctx);
    const gross = value.lines
      .filter((l) => l.type === 'earning')
      .reduce((sum, l) => sum + l.amountCents, 0);
    const withheld = value.lines
      .filter((l) => l.type === 'tax' || l.type === 'deduction')
      .reduce((sum, l) => sum + l.amountCents, 0);
    if (gross <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A payslip must include at least one earning line',
        path: ['lines'],
      });
    }
    if (withheld > gross) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Taxes and deductions cannot exceed gross pay',
        path: ['lines'],
      });
    }
  });
export type CreatePayslipInput = z.infer<typeof createPayslipSchema>;
