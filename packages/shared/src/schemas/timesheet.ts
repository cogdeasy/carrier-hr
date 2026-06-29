import { z } from 'zod';
import { TIMESHEET_STATUSES } from '../enums.js';
import { dateString } from './common.js';
import { employeeRefSchema } from './employee.js';

/** Attendance & timesheet policy. Shared so the API and web validate identically. */
export const TIMESHEET_POLICY = {
  maxHoursPerDay: 24,
  maxHoursPerWeek: 80,
  /** Standard work week; hours beyond this count as overtime. */
  standardWeeklyHours: 40,
  /** Days into the future an entry may be dated (0 = today is the latest). */
  futureGraceDays: 0,
} as const;

/** Days (Mon–Sun) covered by a timesheet week starting on `weekStarting`. */
export function timesheetWeekDates(weekStarting: string): string[] {
  const start = new Date(`${weekStarting}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** True when `iso` is the Monday that opens its week. */
export function isMonday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

/** Splits total weekly hours into regular and overtime per policy. */
export function splitOvertime(totalHours: number): { regularHours: number; overtimeHours: number } {
  const regularHours = Math.min(totalHours, TIMESHEET_POLICY.standardWeeklyHours);
  return { regularHours, overtimeHours: Math.max(0, totalHours - regularHours) };
}

export const timesheetEntrySchema = z.object({
  id: z.string(),
  date: dateString,
  project: z.string(),
  task: z.string().nullable(),
  hours: z.number().min(0).max(TIMESHEET_POLICY.maxHoursPerDay),
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
  regularHours: z.number(),
  overtimeHours: z.number(),
  entries: z.array(timesheetEntrySchema),
  approverId: z.string().nullable(),
  approver: employeeRefSchema.optional(),
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
  task: z.string().max(160).optional(),
  hours: z.number().min(0).max(TIMESHEET_POLICY.maxHoursPerDay),
  notes: z.string().max(500).optional(),
});
export type TimesheetEntryInput = z.infer<typeof timesheetEntryInputSchema>;

export const saveTimesheetSchema = z
  .object({
    weekStarting: dateString,
    entries: z.array(timesheetEntryInputSchema).max(50),
  })
  .superRefine((value, ctx) => {
    if (!isMonday(value.weekStarting)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekStarting'],
        message: 'Week must start on a Monday',
      });
    }
    const week = new Set(timesheetWeekDates(value.weekStarting));
    const perDay = new Map<string, number>();
    value.entries.forEach((entry, i) => {
      if (!week.has(entry.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', i, 'date'],
          message: 'Entry date is outside the timesheet week',
        });
      }
      perDay.set(entry.date, (perDay.get(entry.date) ?? 0) + entry.hours);
    });
    for (const [date, hours] of perDay) {
      if (hours > TIMESHEET_POLICY.maxHoursPerDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries'],
          message: `Total hours for ${date} exceed ${TIMESHEET_POLICY.maxHoursPerDay} per day`,
        });
      }
    }
    const total = value.entries.reduce((sum, e) => sum + e.hours, 0);
    if (total > TIMESHEET_POLICY.maxHoursPerWeek) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries'],
        message: `Total weekly hours exceed ${TIMESHEET_POLICY.maxHoursPerWeek}`,
      });
    }
  });
export type SaveTimesheetInput = z.infer<typeof saveTimesheetSchema>;

export const decideTimesheetSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    decisionNote: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'rejected' && !value.decisionNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisionNote'],
        message: 'A comment is required when rejecting a timesheet',
      });
    }
  });
export type DecideTimesheetInput = z.infer<typeof decideTimesheetSchema>;

export const bulkDecideTimesheetSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  decisionNote: z.string().max(500).optional(),
});
export type BulkDecideTimesheetInput = z.infer<typeof bulkDecideTimesheetSchema>;

export const timesheetListQuerySchema = z.object({
  status: z.enum(TIMESHEET_STATUSES).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  sort: z.enum(['weekStarting', 'updatedAt', 'status']).default('weekStarting'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TimesheetListQuery = z.infer<typeof timesheetListQuerySchema>;

export const attendanceSummaryQuerySchema = z.object({
  employeeId: z.string().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;

export const attendanceWeekSchema = z.object({
  weekStarting: dateString,
  status: z.enum(TIMESHEET_STATUSES),
  totalHours: z.number(),
  regularHours: z.number(),
  overtimeHours: z.number(),
});
export type AttendanceWeek = z.infer<typeof attendanceWeekSchema>;

export const attendanceSummarySchema = z.object({
  employeeId: z.string(),
  weeks: z.array(attendanceWeekSchema),
  totalHours: z.number(),
  regularHours: z.number(),
  overtimeHours: z.number(),
  approvedHours: z.number(),
  submittedCount: z.number().int(),
  approvedCount: z.number().int(),
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;
