/** Domain enumerations shared across the platform. */

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated', 'pre_start'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const TIME_OFF_TYPES = [
  'vacation',
  'sick',
  'personal',
  'bereavement',
  'jury_duty',
  'parental',
  'unpaid',
] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

// Leave types that draw down an accrued balance. All other types
// (bereavement, jury_duty, parental, unpaid) are granted without a balance
// check and do not decrement an accrual.
export const ACCRUAL_TIME_OFF_TYPES = ['vacation', 'sick', 'personal'] as const;
export function isAccrualTimeOffType(type: string): type is (typeof ACCRUAL_TIME_OFF_TYPES)[number] {
  return (ACCRUAL_TIME_OFF_TYPES as readonly string[]).includes(type);
}

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TIMESHEET_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const REVIEW_CYCLE_STATUSES = ['upcoming', 'active', 'closed'] as const;
export type ReviewCycleStatus = (typeof REVIEW_CYCLE_STATUSES)[number];

export const REVIEW_STATUSES = [
  'not_started',
  'self_review',
  'manager_review',
  'calibration',
  'completed',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const GOAL_STATUSES = ['draft', 'active', 'at_risk', 'completed', 'cancelled'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const JOB_STATUSES = ['draft', 'open', 'on_hold', 'closed', 'filled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CANDIDATE_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const ONBOARDING_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'overdue'] as const;
export type OnboardingTaskStatus = (typeof ONBOARDING_TASK_STATUSES)[number];

export const COURSE_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_CATEGORIES = [
  'Compliance',
  'Safety',
  'Security',
  'Leadership',
  'Technical',
  'Operations',
  'Professional',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_SORTS = ['title', 'duration', 'recent'] as const;
export type CourseSort = (typeof COURSE_SORTS)[number];

export const BENEFIT_TYPES = [
  'medical',
  'dental',
  'vision',
  'life',
  'disability',
  'retirement_401k',
  'hsa',
  'fsa',
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

export const ENROLLMENT_STATUSES = ['enrolled', 'waived', 'pending'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const PAYSLIP_STATUSES = ['draft', 'issued', 'paid'] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'timeoff_request',
  'timeoff_decision',
  'timesheet_reminder',
  'review_assigned',
  'goal_update',
  'document_request',
  'onboarding_task',
  'learning_assigned',
  'announcement',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];
