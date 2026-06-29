import { z } from 'zod';
import { BENEFIT_TYPES, ENROLLMENT_STATUSES } from '../enums.js';

export const COVERAGE_TIERS = [
  'employee_only',
  'employee_spouse',
  'employee_children',
  'family',
] as const;
export type CoverageTier = (typeof COVERAGE_TIERS)[number];

export const COVERAGE_TIER_LABELS: Record<CoverageTier, string> = {
  employee_only: 'Employee Only',
  employee_spouse: 'Employee + Spouse',
  employee_children: 'Employee + Children',
  family: 'Family',
};

/** Coverage tiers that require at least one covered dependent. */
export const TIERS_REQUIRING_DEPENDENTS: CoverageTier[] = [
  'employee_spouse',
  'employee_children',
  'family',
];

export const DEPENDENT_RELATIONSHIPS = ['spouse', 'domestic_partner', 'child', 'other'] as const;
export type DependentRelationship = (typeof DEPENDENT_RELATIONSHIPS)[number];

export const QLE_TYPES = [
  'marriage',
  'divorce',
  'birth',
  'adoption',
  'death',
  'loss_of_coverage',
  'gain_of_coverage',
  'relocation',
  'other',
] as const;
export type QualifyingLifeEventType = (typeof QLE_TYPES)[number];

export const QLE_STATUSES = ['pending', 'approved', 'denied'] as const;
export type QualifyingLifeEventStatus = (typeof QLE_STATUSES)[number];

/** A special-enrollment window opens for this many days after the event date. */
export const QLE_WINDOW_DAYS = 30;

/** Derived lifecycle of an election relative to its effective/end dates. */
export const COVERAGE_STATES = ['pending', 'current', 'ended', 'waived'] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

// ---------------------------------------------------------------------------
// Plans & tiers
// ---------------------------------------------------------------------------

export const benefitPlanTierSchema = z.object({
  tier: z.enum(COVERAGE_TIERS),
  monthlyPremiumCents: z.number().int().min(0),
  employerContributionCents: z.number().int().min(0),
});
export type BenefitPlanTier = z.infer<typeof benefitPlanTierSchema>;

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
  tiers: benefitPlanTierSchema.array(),
});
export type BenefitPlan = z.infer<typeof benefitPlanSchema>;

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

export const dependentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  relationship: z.enum(DEPENDENT_RELATIONSHIPS),
  dateOfBirth: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Dependent = z.infer<typeof dependentSchema>;

export const createDependentSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  relationship: z.enum(DEPENDENT_RELATIONSHIPS),
  dateOfBirth: isoDate.refine((d) => new Date(`${d}T00:00:00Z`) <= new Date(), {
    message: 'Date of birth cannot be in the future',
  }),
});
export type CreateDependentInput = z.infer<typeof createDependentSchema>;

export const updateDependentSchema = createDependentSchema.partial();
export type UpdateDependentInput = z.infer<typeof updateDependentSchema>;

// ---------------------------------------------------------------------------
// Qualifying life events
// ---------------------------------------------------------------------------

export const qualifyingLifeEventSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  type: z.enum(QLE_TYPES),
  eventDate: z.string(),
  status: z.enum(QLE_STATUSES),
  windowEndsAt: z.string(),
  note: z.string().nullable(),
  decidedById: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QualifyingLifeEvent = z.infer<typeof qualifyingLifeEventSchema>;

export const createLifeEventSchema = z.object({
  type: z.enum(QLE_TYPES),
  eventDate: isoDate.refine((d) => new Date(`${d}T00:00:00Z`) <= new Date(), {
    message: 'Event date cannot be in the future',
  }),
  note: z.string().trim().max(500).optional(),
});
export type CreateLifeEventInput = z.infer<typeof createLifeEventSchema>;

export const decideLifeEventSchema = z.object({
  status: z.enum(['approved', 'denied']),
  note: z.string().trim().max(500).optional(),
});
export type DecideLifeEventInput = z.infer<typeof decideLifeEventSchema>;

// ---------------------------------------------------------------------------
// Enrollment windows
// ---------------------------------------------------------------------------

export const enrollmentPeriodSchema = z.object({
  id: z.string(),
  name: z.string(),
  planYear: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
  isOpen: z.boolean(),
});
export type EnrollmentPeriod = z.infer<typeof enrollmentPeriodSchema>;

export interface EnrollmentEligibility {
  /** True when the employee may currently elect/change/waive coverage. */
  canEnroll: boolean;
  /** The reason enrollment is allowed (open window or an approved QLE). */
  reason: 'open_enrollment' | 'qualifying_life_event' | 'closed';
  openPeriod: EnrollmentPeriod | null;
  activeLifeEvent: QualifyingLifeEvent | null;
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export const benefitEnrollmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  planId: z.string(),
  plan: benefitPlanSchema.optional(),
  status: z.enum(ENROLLMENT_STATUSES),
  coverageTier: z.enum(COVERAGE_TIERS),
  coverageState: z.enum(COVERAGE_STATES),
  effectiveDate: z.string().nullable(),
  endDate: z.string().nullable(),
  qleId: z.string().nullable(),
  electedAt: z.string().nullable(),
  dependents: z.number().int().min(0),
  dependentIds: z.string().array(),
  monthlyPremiumCents: z.number().int(),
  employerContributionCents: z.number().int(),
  employeeCostCents: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BenefitEnrollment = z.infer<typeof benefitEnrollmentSchema>;

export const enrollBenefitSchema = z
  .object({
    planId: z.string().min(1),
    status: z.enum(['enrolled', 'waived']),
    coverageTier: z.enum(COVERAGE_TIERS).default('employee_only'),
    dependentIds: z.string().array().max(15).default([]),
    effectiveDate: isoDate.optional(),
    qleId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'waived') return;
    const needsDependents = TIERS_REQUIRING_DEPENDENTS.includes(value.coverageTier);
    if (needsDependents && value.dependentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dependentIds'],
        message: `Coverage tier "${value.coverageTier}" requires at least one dependent`,
      });
    }
    if (value.coverageTier === 'employee_only' && value.dependentIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dependentIds'],
        message: 'Employee-only coverage cannot include dependents',
      });
    }
  });
export type EnrollBenefitInput = z.infer<typeof enrollBenefitSchema>;

export const listEnrollmentsQuerySchema = z.object({
  employeeId: z.string().optional(),
  type: z.enum(BENEFIT_TYPES).optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  planYear: z.coerce.number().int().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['effectiveDate', 'updatedAt', 'employeeName']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;

export const adminEnrollmentSchema = benefitEnrollmentSchema.extend({
  employeeName: z.string(),
  employeeNumber: z.string(),
  department: z.string(),
});
export type AdminEnrollment = z.infer<typeof adminEnrollmentSchema>;

export const paginatedEnrollmentsSchema = z.object({
  items: adminEnrollmentSchema.array(),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedEnrollments = z.infer<typeof paginatedEnrollmentsSchema>;

// ---------------------------------------------------------------------------
// Cost summary
// ---------------------------------------------------------------------------

export const PAY_PERIODS_PER_YEAR = 26;

export const costSummaryItemSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  type: z.enum(BENEFIT_TYPES),
  coverageTier: z.enum(COVERAGE_TIERS),
  coverageState: z.enum(COVERAGE_STATES),
  monthlyEmployeeCents: z.number().int(),
  monthlyEmployerCents: z.number().int(),
});
export type CostSummaryItem = z.infer<typeof costSummaryItemSchema>;

export const costSummarySchema = z.object({
  payPeriodsPerYear: z.number().int(),
  monthlyEmployeeCents: z.number().int(),
  monthlyEmployerCents: z.number().int(),
  annualEmployeeCents: z.number().int(),
  annualEmployerCents: z.number().int(),
  perPaycheckEmployeeCents: z.number().int(),
  items: costSummaryItemSchema.array(),
});
export type CostSummary = z.infer<typeof costSummarySchema>;
