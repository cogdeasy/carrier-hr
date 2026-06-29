import { z } from 'zod';
import { ONBOARDING_TASK_STATUSES } from '../enums.js';
import { dateString } from './common.js';

export const onboardingTaskSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  assigneeRole: z.string(),
  status: z.enum(ONBOARDING_TASK_STATUSES),
  dueDate: dateString.nullable(),
  completedAt: z.string().nullable(),
  orderIndex: z.number().int(),
});
export type OnboardingTask = z.infer<typeof onboardingTaskSchema>;

export const onboardingPlanSchema = z.object({
  employeeId: z.string(),
  totalTasks: z.number().int(),
  completedTasks: z.number().int(),
  percentComplete: z.number().int(),
  tasks: z.array(onboardingTaskSchema),
});
export type OnboardingPlan = z.infer<typeof onboardingPlanSchema>;

export const updateOnboardingTaskSchema = z.object({
  status: z.enum(ONBOARDING_TASK_STATUSES),
});
export type UpdateOnboardingTaskInput = z.infer<typeof updateOnboardingTaskSchema>;
