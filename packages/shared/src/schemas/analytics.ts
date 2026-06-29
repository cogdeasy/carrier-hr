import { z } from 'zod';
import { EMPLOYEE_STATUSES } from '../enums.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * Query filters accepted by the org-wide analytics endpoints. `from`/`to` bound
 * the analysis window for time-series and flow metrics (hires, terminations,
 * turnover); the categorical filters narrow the population used for headcount
 * distributions. All fields are optional and validated server-side.
 */
export const analyticsFiltersSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    department: z.string().trim().min(1).optional(),
    division: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;

export const categoryCountSchema = z.object({
  label: z.string(),
  count: z.number().int(),
});
export type CategoryCount = z.infer<typeof categoryCountSchema>;

export const headcountTrendPointSchema = z.object({
  month: z.string(),
  headcount: z.number().int(),
  hires: z.number().int(),
  terminations: z.number().int(),
});
export type HeadcountTrendPoint = z.infer<typeof headcountTrendPointSchema>;

export const timeOffUtilizationSchema = z.object({
  type: z.string(),
  accruedDays: z.number(),
  usedDays: z.number(),
  utilizationRate: z.number(),
});
export type TimeOffUtilization = z.infer<typeof timeOffUtilizationSchema>;

export const ANALYTICS_DATASETS = [
  'headcountByDepartment',
  'headcountByDivision',
  'headcountByLocation',
  'headcountByStatus',
  'headcountByEmploymentType',
  'genderDistribution',
  'tenureDistribution',
  'headcountTrend',
  'timeOffUtilization',
  'openRequisitionsByDepartment',
] as const;
export type AnalyticsDataset = (typeof ANALYTICS_DATASETS)[number];

export const analyticsExportQuerySchema = analyticsFiltersSchema.and(
  z.object({ dataset: z.enum(ANALYTICS_DATASETS) }),
);
export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>;

export const hrDashboardSchema = z.object({
  filters: z.object({
    from: z.string(),
    to: z.string(),
    department: z.string().nullable(),
    division: z.string().nullable(),
    location: z.string().nullable(),
    status: z.string().nullable(),
  }),
  totalEmployees: z.number().int(),
  activeEmployees: z.number().int(),
  onLeave: z.number().int(),
  terminated: z.number().int(),
  openRequisitions: z.number().int(),
  pendingTimeOff: z.number().int(),
  pendingTimesheets: z.number().int(),
  newHiresThisMonth: z.number().int(),
  hiresInRange: z.number().int(),
  terminationsInRange: z.number().int(),
  turnoverRate: z.number(),
  avgTenureYears: z.number(),
  trainingComplianceRate: z.number(),
  headcountByDepartment: z.array(categoryCountSchema),
  headcountByDivision: z.array(categoryCountSchema),
  headcountByLocation: z.array(categoryCountSchema),
  headcountByStatus: z.array(categoryCountSchema),
  headcountByEmploymentType: z.array(categoryCountSchema),
  genderDistribution: z.array(categoryCountSchema),
  tenureDistribution: z.array(categoryCountSchema),
  headcountTrend: z.array(headcountTrendPointSchema),
  timeOffUtilization: z.array(timeOffUtilizationSchema),
  openRequisitionsByDepartment: z.array(categoryCountSchema),
});
export type HrDashboard = z.infer<typeof hrDashboardSchema>;

export const teamUpcomingTimeOffSchema = z.object({
  employeeName: z.string(),
  type: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number(),
});
export type TeamUpcomingTimeOff = z.infer<typeof teamUpcomingTimeOffSchema>;

export const teamDashboardSchema = z.object({
  teamSize: z.number().int(),
  activeMembers: z.number().int(),
  onLeave: z.number().int(),
  pendingTimeOff: z.number().int(),
  pendingTimesheets: z.number().int(),
  pendingReviews: z.number().int(),
  activeGoals: z.number().int(),
  atRiskGoals: z.number().int(),
  trainingComplianceRate: z.number(),
  headcountByStatus: z.array(categoryCountSchema),
  upcomingTimeOff: z.array(teamUpcomingTimeOffSchema),
});
export type TeamDashboard = z.infer<typeof teamDashboardSchema>;

export const employeeDashboardSchema = z.object({
  timeOffBalanceDays: z.number(),
  pendingRequests: z.number().int(),
  upcomingHolidays: z.array(z.object({ name: z.string(), date: z.string() })),
  activeGoals: z.number().int(),
  onboardingPercent: z.number().int().nullable(),
  unreadNotifications: z.number().int(),
  requiredCoursesOutstanding: z.number().int(),
});
export type EmployeeDashboard = z.infer<typeof employeeDashboardSchema>;
