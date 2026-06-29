import { z } from 'zod';
import { CANDIDATE_STAGES, JOB_STATUSES } from '../enums.js';
import { dateString } from './common.js';

export const jobRequisitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  employmentType: z.string(),
  status: z.enum(JOB_STATUSES),
  description: z.string(),
  hiringManagerId: z.string().nullable(),
  recruiterId: z.string().nullable(),
  openings: z.number().int().min(1),
  postedDate: dateString.nullable(),
  salaryMinCents: z.number().int().nullable(),
  salaryMaxCents: z.number().int().nullable(),
  candidateCount: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRequisition = z.infer<typeof jobRequisitionSchema>;

export const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  department: z.string().min(1).max(160),
  location: z.string().min(1).max(160),
  employmentType: z.string().min(1).max(60),
  description: z.string().min(1).max(8000),
  hiringManagerId: z.string().nullable().optional(),
  openings: z.number().int().min(1).max(100).default(1),
  salaryMinCents: z.number().int().nullable().optional(),
  salaryMaxCents: z.number().int().nullable().optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(JOB_STATUSES).optional(),
  recruiterId: z.string().nullable().optional(),
});
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const candidateSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  stage: z.enum(CANDIDATE_STAGES),
  resumeUrl: z.string().nullable(),
  source: z.string().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
  appliedAt: z.string(),
  updatedAt: z.string(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const createCandidateSchema = z.object({
  jobId: z.string(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  source: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = z.object({
  stage: z.enum(CANDIDATE_STAGES).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
