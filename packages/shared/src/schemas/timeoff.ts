import { z } from 'zod';
import { REQUEST_STATUSES, TIME_OFF_TYPES } from '../enums.js';
import { dateString, paginatedSchema, paginationQuerySchema } from './common.js';
import { employeeRefSchema } from './employee.js';

export const timeOffBalanceSchema = z.object({
  type: z.enum(TIME_OFF_TYPES),
  accruedDays: z.number(),
  usedDays: z.number(),
  pendingDays: z.number(),
  availableDays: z.number(),
  /** Days projected to carry into next year given the policy cap. */
  carryoverEligibleDays: z.number(),
});
export type TimeOffBalance = z.infer<typeof timeOffBalanceSchema>;

export const timeOffPolicySchema = z.object({
  type: z.enum(TIME_OFF_TYPES),
  accrual: z.boolean(),
  annualAccrualDays: z.number(),
  maxCarryoverDays: z.number(),
  requiresApproval: z.boolean(),
});
export type TimeOffPolicy = z.infer<typeof timeOffPolicySchema>;

/**
 * Baseline leave policy used to seed the policy table and as a fallback when a
 * type has no row yet. Accrual types (vacation/sick/personal) draw down a
 * balance and carry over up to a cap; the rest are granted without a balance.
 */
export const DEFAULT_TIME_OFF_POLICIES: TimeOffPolicy[] = [
  { type: 'vacation', accrual: true, annualAccrualDays: 20, maxCarryoverDays: 5, requiresApproval: true },
  { type: 'sick', accrual: true, annualAccrualDays: 10, maxCarryoverDays: 5, requiresApproval: true },
  { type: 'personal', accrual: true, annualAccrualDays: 5, maxCarryoverDays: 2, requiresApproval: true },
  { type: 'bereavement', accrual: false, annualAccrualDays: 0, maxCarryoverDays: 0, requiresApproval: true },
  { type: 'jury_duty', accrual: false, annualAccrualDays: 0, maxCarryoverDays: 0, requiresApproval: true },
  { type: 'parental', accrual: false, annualAccrualDays: 0, maxCarryoverDays: 0, requiresApproval: true },
  { type: 'unpaid', accrual: false, annualAccrualDays: 0, maxCarryoverDays: 0, requiresApproval: true },
];

export const timeOffRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employee: employeeRefSchema.optional(),
  type: z.enum(TIME_OFF_TYPES),
  startDate: dateString,
  endDate: dateString,
  totalDays: z.number(),
  reason: z.string().nullable(),
  attachmentUrl: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  approverId: z.string().nullable(),
  approver: employeeRefSchema.nullable().optional(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TimeOffRequest = z.infer<typeof timeOffRequestSchema>;

export const createTimeOffSchema = z
  .object({
    type: z.enum(TIME_OFF_TYPES),
    startDate: dateString,
    endDate: dateString,
    reason: z.string().trim().max(500).optional(),
    attachmentUrl: z.string().trim().url('Attachment must be a valid URL').max(2048).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;

export const decideTimeOffSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(500).optional(),
});
export type DecideTimeOffInput = z.infer<typeof decideTimeOffSchema>;

export const listTimeOffQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(TIME_OFF_TYPES).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  sort: z.enum(['createdAt', 'startDate']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListTimeOffQuery = z.infer<typeof listTimeOffQuerySchema>;

export const timeOffRequestPageSchema = paginatedSchema(timeOffRequestSchema);

export const teamCalendarQuerySchema = z
  .object({
    from: dateString,
    to: dateString,
  })
  .refine((v) => v.to >= v.from, {
    message: 'End date must be on or after the start date',
    path: ['to'],
  });
export type TeamCalendarQuery = z.infer<typeof teamCalendarQuerySchema>;

export const companyHolidaySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: dateString,
  region: z.string(),
});
export type CompanyHoliday = z.infer<typeof companyHolidaySchema>;

export const createCompanyHolidaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: dateString,
  region: z.string().trim().min(1).max(16).default('US'),
});
export type CreateCompanyHolidayInput = z.infer<typeof createCompanyHolidaySchema>;

export const updateCompanyHolidaySchema = createCompanyHolidaySchema.partial();
export type UpdateCompanyHolidayInput = z.infer<typeof updateCompanyHolidaySchema>;
