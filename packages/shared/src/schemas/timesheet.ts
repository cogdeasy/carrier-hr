import { z } from 'zod';
import { TIMESHEET_STATUSES } from '../enums.js';
import { dateString } from './common.js';
import { employeeRefSchema } from './employee.js';

export const timesheetEntrySchema = z.object({
  id: z.string(),
  date: dateString,
  project: z.string(),
  hours: z.number().min(0).max(24),
  notes: z.string().nullable(),
});
export type TimesheetEntry = z.infer<typeof timesheetEntrySchema>;

export const timesheetSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employee: employeeRefSchema.optional(),
  weekStarting: dateString,
  status: z.enum(TIMESHEET_STATUSES),
  totalHours: z.number(),
  entries: z.array(timesheetEntrySchema),
  approverId: z.string().nullable(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Timesheet = z.infer<typeof timesheetSchema>;

export const timesheetEntryInputSchema = z.object({
  date: dateString,
  project: z.string().min(1).max(160),
  hours: z.number().min(0).max(24),
  notes: z.string().max(500).optional(),
});

export const saveTimesheetSchema = z.object({
  weekStarting: dateString,
  entries: z.array(timesheetEntryInputSchema).max(50),
});
export type SaveTimesheetInput = z.infer<typeof saveTimesheetSchema>;

export const decideTimesheetSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().max(500).optional(),
});
export type DecideTimesheetInput = z.infer<typeof decideTimesheetSchema>;
