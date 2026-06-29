import { z } from 'zod';
import { BENEFIT_TYPES, ENROLLMENT_STATUSES } from '../enums.js';

export const benefitPlanSchema = z.object({
  id: z.string(),
  type: z.enum(BENEFIT_TYPES),
  name: z.string(),
  carrier: z.string(),
  description: z.string(),
  monthlyPremiumCents: z.number().int(),
  employerContributionCents: z.number().int(),
  coverageLevel: z.string(),
  planYear: z.number().int(),
});
export type BenefitPlan = z.infer<typeof benefitPlanSchema>;

export const benefitEnrollmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  planId: z.string(),
  plan: benefitPlanSchema.optional(),
  status: z.enum(ENROLLMENT_STATUSES),
  electedAt: z.string().nullable(),
  dependents: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BenefitEnrollment = z.infer<typeof benefitEnrollmentSchema>;

export const enrollBenefitSchema = z.object({
  planId: z.string(),
  status: z.enum(ENROLLMENT_STATUSES),
  dependents: z.number().int().min(0).max(15).default(0),
});
export type EnrollBenefitInput = z.infer<typeof enrollBenefitSchema>;
