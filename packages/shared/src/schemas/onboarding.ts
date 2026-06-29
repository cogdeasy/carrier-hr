import { z } from 'zod';
import { ONBOARDING_TASK_STATUSES } from '../enums.js';
import { dateString } from './common.js';

export const ONBOARDING_CHECKLIST_TYPES = ['onboarding', 'offboarding'] as const;
export type OnboardingChecklistType = (typeof ONBOARDING_CHECKLIST_TYPES)[number];

export const ONBOARDING_CHECKLIST_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type OnboardingChecklistStatus = (typeof ONBOARDING_CHECKLIST_STATUSES)[number];

/**
 * Who owns a checklist task. These map onto platform roles: the new hire
 * (employee), their manager, IT (super_admin) and HR (hr_admin).
 */
export const ONBOARDING_ASSIGNEE_ROLES = ['employee', 'manager', 'super_admin', 'hr_admin'] as const;
export type OnboardingAssigneeRole = (typeof ONBOARDING_ASSIGNEE_ROLES)[number];

export const ASSIGNEE_ROLE_LABELS: Record<OnboardingAssigneeRole, string> = {
  employee: 'New hire',
  manager: 'Manager',
  super_admin: 'IT',
  hr_admin: 'HR',
};

export const onboardingTaskSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  checklistId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  assigneeRole: z.string(),
  status: z.enum(ONBOARDING_TASK_STATUSES),
  dueDate: dateString.nullable(),
  completedAt: z.string().nullable(),
  orderIndex: z.number().int(),
  overdue: z.boolean(),
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

export const onboardingChecklistSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  templateId: z.string().nullable(),
  type: z.enum(ONBOARDING_CHECKLIST_TYPES),
  title: z.string(),
  status: z.enum(ONBOARDING_CHECKLIST_STATUSES),
  anchorDate: dateString,
  createdAt: z.string(),
  updatedAt: z.string(),
  totalTasks: z.number().int(),
  completedTasks: z.number().int(),
  overdueTasks: z.number().int(),
  percentComplete: z.number().int(),
  employee: z
    .object({ id: z.string(), name: z.string(), jobTitle: z.string().nullable() })
    .nullable()
    .optional(),
  tasks: z.array(onboardingTaskSchema).optional(),
});
export type OnboardingChecklist = z.infer<typeof onboardingChecklistSchema>;

export const onboardingTemplateItemSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  assigneeRole: z.string(),
  dueOffsetDays: z.number().int(),
  orderIndex: z.number().int(),
});
export type OnboardingTemplateItem = z.infer<typeof onboardingTemplateItemSchema>;

export const onboardingTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ONBOARDING_CHECKLIST_TYPES),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  itemCount: z.number().int(),
  items: z.array(onboardingTemplateItemSchema).optional(),
});
export type OnboardingTemplate = z.infer<typeof onboardingTemplateSchema>;

// --- input schemas ---------------------------------------------------------

const templateItemInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
  category: z.string().min(1).max(80).default('general'),
  assigneeRole: z.enum(ONBOARDING_ASSIGNEE_ROLES),
  dueOffsetDays: z.number().int().min(-365).max(365).default(0),
});
export type TemplateItemInput = z.infer<typeof templateItemInputSchema>;

export const createOnboardingTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(ONBOARDING_CHECKLIST_TYPES),
  description: z.string().max(1000).nullish(),
  isDefault: z.boolean().optional(),
  items: z.array(templateItemInputSchema).default([]),
});
export type CreateOnboardingTemplateInput = z.infer<typeof createOnboardingTemplateSchema>;

export const updateOnboardingTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullish(),
  isDefault: z.boolean().optional(),
});
export type UpdateOnboardingTemplateInput = z.infer<typeof updateOnboardingTemplateSchema>;

export const createTemplateItemSchema = templateItemInputSchema;

export const updateTemplateItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
  category: z.string().min(1).max(80).optional(),
  assigneeRole: z.enum(ONBOARDING_ASSIGNEE_ROLES).optional(),
  dueOffsetDays: z.number().int().min(-365).max(365).optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type UpdateTemplateItemInput = z.infer<typeof updateTemplateItemSchema>;

export const instantiateChecklistSchema = z.object({
  employeeId: z.string().min(1),
  templateId: z.string().min(1),
  anchorDate: dateString,
});
export type InstantiateChecklistInput = z.infer<typeof instantiateChecklistSchema>;

export const triggerOffboardingSchema = z.object({
  employeeId: z.string().min(1),
  lastDay: dateString,
  templateId: z.string().min(1).optional(),
  markTerminated: z.boolean().optional(),
});
export type TriggerOffboardingInput = z.infer<typeof triggerOffboardingSchema>;

export const updateChecklistSchema = z.object({
  status: z.enum(ONBOARDING_CHECKLIST_STATUSES),
});
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;

export const createChecklistTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
  category: z.string().min(1).max(80).default('general'),
  assigneeRole: z.enum(ONBOARDING_ASSIGNEE_ROLES),
  dueDate: dateString.nullish(),
});
export type CreateChecklistTaskInput = z.infer<typeof createChecklistTaskSchema>;

export const updateOnboardingTaskSchema = z.object({
  status: z.enum(ONBOARDING_TASK_STATUSES),
});
export type UpdateOnboardingTaskInput = z.infer<typeof updateOnboardingTaskSchema>;
