import { z } from 'zod';
import {
  CANDIDATE_STAGES,
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  JOB_STATUSES,
  OFFER_STATUSES,
  SCORECARD_RECOMMENDATIONS,
} from '../enums.js';
import { dateString } from './common.js';

export const jobRequisitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string(),
  division: z.string().nullable(),
  location: z.string(),
  employmentType: z.string(),
  status: z.enum(JOB_STATUSES),
  description: z.string(),
  hiringManagerId: z.string().nullable(),
  recruiterId: z.string().nullable(),
  openings: z.number().int().min(1),
  filledCount: z.number().int().min(0),
  postedDate: dateString.nullable(),
  closedAt: z.string().nullable(),
  approvedById: z.string().nullable(),
  approvedAt: z.string().nullable(),
  salaryMinCents: z.number().int().nullable(),
  salaryMaxCents: z.number().int().nullable(),
  candidateCount: z.number().int().optional(),
  activeCandidateCount: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRequisition = z.infer<typeof jobRequisitionSchema>;

const salaryRange = {
  salaryMinCents: z.number().int().min(0).nullable().optional(),
  salaryMaxCents: z.number().int().min(0).nullable().optional(),
};

export const createJobSchema = z
  .object({
    title: z.string().min(1).max(200),
    department: z.string().min(1).max(160),
    division: z.string().max(160).nullable().optional(),
    location: z.string().min(1).max(160),
    employmentType: z.string().min(1).max(60),
    description: z.string().min(1).max(8000),
    hiringManagerId: z.string().nullable().optional(),
    openings: z.number().int().min(1).max(100).default(1),
    ...salaryRange,
  })
  .refine(
    (v) =>
      v.salaryMinCents == null || v.salaryMaxCents == null || v.salaryMaxCents >= v.salaryMinCents,
    { message: 'Maximum salary must be greater than or equal to minimum salary', path: ['salaryMaxCents'] },
  );
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    department: z.string().min(1).max(160).optional(),
    division: z.string().max(160).nullable().optional(),
    location: z.string().min(1).max(160).optional(),
    employmentType: z.string().min(1).max(60).optional(),
    description: z.string().min(1).max(8000).optional(),
    hiringManagerId: z.string().nullable().optional(),
    recruiterId: z.string().nullable().optional(),
    openings: z.number().int().min(1).max(100).optional(),
    ...salaryRange,
  })
  .refine(
    (v) =>
      v.salaryMinCents == null || v.salaryMaxCents == null || v.salaryMaxCents >= v.salaryMinCents,
    { message: 'Maximum salary must be greater than or equal to minimum salary', path: ['salaryMaxCents'] },
  );
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const jobStatusActionSchema = z.object({
  status: z.enum(['open', 'on_hold', 'closed']),
});
export type JobStatusActionInput = z.infer<typeof jobStatusActionSchema>;

export const listJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  department: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'title', 'department', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

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
  resumeUrl: z.string().url().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  resumeUrl: z.string().url().max(2000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

export const moveCandidateStageSchema = z.object({
  stage: z.enum(CANDIDATE_STAGES),
  note: z.string().max(500).optional(),
});
export type MoveCandidateStageInput = z.infer<typeof moveCandidateStageSchema>;

export const candidateStageEventSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  fromStage: z.enum(CANDIDATE_STAGES).nullable(),
  toStage: z.enum(CANDIDATE_STAGES),
  note: z.string().nullable(),
  changedById: z.string().nullable(),
  changedByName: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CandidateStageEvent = z.infer<typeof candidateStageEventSchema>;

export const interviewSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobId: z.string(),
  interviewerId: z.string(),
  interviewerName: z.string().nullable().optional(),
  scheduledAt: z.string(),
  durationMinutes: z.number().int().min(15).max(480),
  mode: z.enum(INTERVIEW_MODES),
  stage: z.string(),
  location: z.string().nullable(),
  status: z.enum(INTERVIEW_STATUSES),
  scorecard: z.lazy(() => scorecardSchema).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Interview = z.infer<typeof interviewSchema>;

export const scheduleInterviewSchema = z.object({
  candidateId: z.string(),
  interviewerId: z.string(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  mode: z.enum(INTERVIEW_MODES).default('video'),
  location: z.string().max(400).nullable().optional(),
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const updateInterviewSchema = z.object({
  interviewerId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  mode: z.enum(INTERVIEW_MODES).optional(),
  location: z.string().max(400).nullable().optional(),
  status: z.enum(INTERVIEW_STATUSES).optional(),
});
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;

export const scorecardSchema = z.object({
  id: z.string(),
  interviewId: z.string(),
  candidateId: z.string(),
  interviewerId: z.string(),
  interviewerName: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5),
  recommendation: z.enum(SCORECARD_RECOMMENDATIONS),
  strengths: z.string().nullable(),
  concerns: z.string().nullable(),
  comments: z.string().nullable(),
  createdAt: z.string(),
});
export type Scorecard = z.infer<typeof scorecardSchema>;

export const submitScorecardSchema = z.object({
  rating: z.number().int().min(1).max(5),
  recommendation: z.enum(SCORECARD_RECOMMENDATIONS),
  strengths: z.string().max(2000).nullable().optional(),
  concerns: z.string().max(2000).nullable().optional(),
  comments: z.string().max(2000).nullable().optional(),
});
export type SubmitScorecardInput = z.infer<typeof submitScorecardSchema>;

export const offerSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobId: z.string(),
  salaryCents: z.number().int().min(0),
  startDate: dateString,
  status: z.enum(OFFER_STATUSES),
  expiresAt: dateString.nullable(),
  notes: z.string().nullable(),
  extendedById: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Offer = z.infer<typeof offerSchema>;

export const createOfferSchema = z.object({
  candidateId: z.string(),
  salaryCents: z.number().int().min(0),
  startDate: dateString,
  expiresAt: dateString.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z.object({
  salaryCents: z.number().int().min(0).optional(),
  startDate: dateString.optional(),
  expiresAt: dateString.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const offerActionSchema = z.object({
  action: z.enum(['extend', 'accept', 'decline', 'rescind']),
});
export type OfferActionInput = z.infer<typeof offerActionSchema>;

export const candidateDetailSchema = candidateSchema.extend({
  job: jobRequisitionSchema.pick({ id: true, title: true, department: true, status: true }).optional(),
  stageHistory: z.array(candidateStageEventSchema),
  interviews: z.array(interviewSchema),
  offer: offerSchema.nullable(),
});
export type CandidateDetail = z.infer<typeof candidateDetailSchema>;

export const pipelineStageSummarySchema = z.object({
  stage: z.enum(CANDIDATE_STAGES),
  count: z.number().int(),
});
export type PipelineStageSummary = z.infer<typeof pipelineStageSummarySchema>;
