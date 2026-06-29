import { z } from 'zod';
import {
  GOAL_STATUSES,
  REVIEW_CYCLE_STATUSES,
  REVIEW_STATUSES,
} from '../enums.js';
import { dateString } from './common.js';
import { employeeRefSchema } from './employee.js';

export const goalSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
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
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dueDate: dateString.nullable().optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const reviewCycleSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(REVIEW_CYCLE_STATUSES),
  startDate: dateString,
  endDate: dateString,
  createdAt: z.string(),
});
export type ReviewCycle = z.infer<typeof reviewCycleSchema>;

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

export const oneOnOneSchema = z.object({
  id: z.string(),
  managerId: z.string(),
  employeeId: z.string(),
  scheduledFor: z.string(),
  agenda: z.string().nullable(),
  notes: z.string().nullable(),
  completed: z.boolean(),
  createdAt: z.string(),
});
export type OneOnOne = z.infer<typeof oneOnOneSchema>;
