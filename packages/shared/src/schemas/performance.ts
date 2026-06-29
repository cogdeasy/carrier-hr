import { z } from 'zod';
import {
  GOAL_STATUSES,
  REVIEW_CYCLE_STATUSES,
  REVIEW_STATUSES,
} from '../enums.js';
import { dateString, dateTimeString } from './common.js';
import { employeeRefSchema } from './employee.js';

export const goalSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  cycleId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(GOAL_STATUSES),
  progress: z.number().int().min(0).max(100),
  dueDate: dateString.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Goal = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: dateString.optional(),
  cycleId: z.string().min(1).optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(GOAL_STATUSES).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    dueDate: dateString.nullable().optional(),
    cycleId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const goalQuerySchema = z.object({
  employeeId: z.string().optional(),
  cycleId: z.string().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  scope: z.enum(['own', 'team', 'all']).optional(),
});
export type GoalQuery = z.infer<typeof goalQuerySchema>;

export const reviewCycleSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(REVIEW_CYCLE_STATUSES),
  startDate: dateString,
  endDate: dateString,
  createdAt: z.string(),
  reviewCount: z.number().int().optional(),
  completedCount: z.number().int().optional(),
});
export type ReviewCycle = z.infer<typeof reviewCycleSchema>;

export const createReviewCycleSchema = z
  .object({
    name: z.string().min(1).max(200),
    startDate: dateString,
    endDate: dateString,
    status: z.enum(['upcoming', 'active']).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  });
export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;

export const updateReviewCycleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(REVIEW_CYCLE_STATUSES).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateReviewCycleInput = z.infer<typeof updateReviewCycleSchema>;

export const enrollReviewCycleSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500).optional(),
  allWithManager: z.boolean().optional(),
});
export type EnrollReviewCycleInput = z.infer<typeof enrollReviewCycleSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  cycle: reviewCycleSchema.optional(),
  employeeId: z.string(),
  employee: employeeRefSchema.optional(),
  reviewerId: z.string(),
  reviewer: employeeRefSchema.optional(),
  status: z.enum(REVIEW_STATUSES),
  selfAssessment: z.string().nullable(),
  managerAssessment: z.string().nullable(),
  overallRating: z.number().int().min(1).max(5).nullable(),
  submittedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const submitSelfReviewSchema = z.object({
  selfAssessment: z.string().min(1).max(5000),
});
export type SubmitSelfReviewInput = z.infer<typeof submitSelfReviewSchema>;

export const submitManagerReviewSchema = z.object({
  managerAssessment: z.string().min(1).max(5000),
  overallRating: z.number().int().min(1).max(5),
});
export type SubmitManagerReviewInput = z.infer<typeof submitManagerReviewSchema>;

export const oneOnOneActionItemSchema = z.object({
  id: z.string(),
  oneOnOneId: z.string(),
  title: z.string(),
  assigneeId: z.string().nullable(),
  completed: z.boolean(),
  createdAt: z.string(),
});
export type OneOnOneActionItem = z.infer<typeof oneOnOneActionItemSchema>;

export const oneOnOneSchema = z.object({
  id: z.string(),
  managerId: z.string(),
  manager: employeeRefSchema.optional(),
  employeeId: z.string(),
  employee: employeeRefSchema.optional(),
  scheduledFor: z.string(),
  agenda: z.string().nullable(),
  notes: z.string().nullable(),
  completed: z.boolean(),
  actionItems: z.array(oneOnOneActionItemSchema).optional(),
  createdAt: z.string(),
});
export type OneOnOne = z.infer<typeof oneOnOneSchema>;

export const createOneOnOneSchema = z.object({
  employeeId: z.string().min(1),
  scheduledFor: dateTimeString,
  agenda: z.string().max(5000).optional(),
});
export type CreateOneOnOneInput = z.infer<typeof createOneOnOneSchema>;

export const updateOneOnOneSchema = z
  .object({
    scheduledFor: dateTimeString.optional(),
    agenda: z.string().max(5000).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateOneOnOneInput = z.infer<typeof updateOneOnOneSchema>;

export const createActionItemSchema = z.object({
  title: z.string().min(1).max(500),
  assigneeId: z.string().min(1).optional(),
});
export type CreateActionItemInput = z.infer<typeof createActionItemSchema>;

export const updateActionItemSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    completed: z.boolean().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateActionItemInput = z.infer<typeof updateActionItemSchema>;
