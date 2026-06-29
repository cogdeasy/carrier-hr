import { z } from 'zod';

export const headcountByDepartmentSchema = z.object({
  department: z.string(),
  count: z.number().int(),
});

export const headcountTrendPointSchema = z.object({
  month: z.string(),
  headcount: z.number().int(),
  hires: z.number().int(),
  attrition: z.number().int(),
});

export const hrDashboardSchema = z.object({
  totalEmployees: z.number().int(),
  activeEmployees: z.number().int(),
  onLeave: z.number().int(),
  openRequisitions: z.number().int(),
  pendingTimeOff: z.number().int(),
  pendingTimesheets: z.number().int(),
  newHiresThisMonth: z.number().int(),
  attritionRate: z.number(),
  avgTenureYears: z.number(),
  headcountByDepartment: z.array(headcountByDepartmentSchema),
  headcountByLocation: z.array(z.object({ location: z.string(), count: z.number().int() })),
  headcountTrend: z.array(headcountTrendPointSchema),
  genderDistribution: z.array(z.object({ label: z.string(), count: z.number().int() })),
});
export type HrDashboard = z.infer<typeof hrDashboardSchema>;

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
