import { z } from 'zod';
import { REQUEST_STATUSES, TIME_OFF_TYPES } from '../enums.js';
import { dateString } from './common.js';
import { employeeRefSchema } from './employee.js';

export const timeOffBalanceSchema = z.object({
  type: z.enum(TIME_OFF_TYPES),
  accruedDays: z.number(),
  usedDays: z.number(),
  pendingDays: z.number(),
  availableDays: z.number(),
});
export type TimeOffBalance = z.infer<typeof timeOffBalanceSchema>;

export const timeOffRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employee: employeeRefSchema.optional(),
  type: z.enum(TIME_OFF_TYPES),
  startDate: dateString,
  endDate: dateString,
  totalDays: z.number(),
  reason: z.string().nullable(),
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
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;

export const decideTimeOffSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().max(500).optional(),
});
export type DecideTimeOffInput = z.infer<typeof decideTimeOffSchema>;

export const companyHolidaySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: dateString,
  region: z.string(),
});
export type CompanyHoliday = z.infer<typeof companyHolidaySchema>;
