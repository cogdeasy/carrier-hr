import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Full relational schema for the Collins Aerospace HR platform.
 *
 * SQLite is used for portability (embedded file locally, Turso/libSQL in prod).
 * JSON-shaped columns are stored as TEXT and parsed/validated at the service
 * layer with the shared Zod schemas.
 */

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

// ---------------------------------------------------------------------------
// Identity & directory
// ---------------------------------------------------------------------------

export const employees = sqliteTable(
  'employees',
  {
    id: text('id').primaryKey(),
    employeeNumber: text('employee_number').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    workPhone: text('work_phone'),
    personalPhone: text('personal_phone'),
    jobTitle: text('job_title').notNull(),
    department: text('department').notNull(),
    division: text('division').notNull().default('Collins Aerospace'),
    location: text('location').notNull(),
    employmentType: text('employment_type').notNull().default('full_time'),
    status: text('status').notNull().default('active'),
    managerId: text('manager_id'),
    hireDate: text('hire_date').notNull(),
    terminationDate: text('termination_date'),
    dateOfBirth: text('date_of_birth'),
    gender: text('gender'),
    avatarUrl: text('avatar_url'),
    address: text('address'),
    emergencyContact: text('emergency_contact'),
    ...timestamps,
  },
  (t) => ({
    emailIdx: uniqueIndex('employees_email_idx').on(t.email),
    empNoIdx: uniqueIndex('employees_number_idx').on(t.employeeNumber),
    managerIdx: index('employees_manager_idx').on(t.managerId),
    deptIdx: index('employees_dept_idx').on(t.department),
  }),
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastLoginAt: text('last_login_at'),
    ...timestamps,
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    employeeIdx: uniqueIndex('users_employee_idx').on(t.employeeId),
  }),
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => ({
    userRoleIdx: uniqueIndex('user_roles_user_role_idx').on(t.userId, t.role),
  }),
);

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export const timeOffBalances = sqliteTable(
  'time_off_balances',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    accruedDays: real('accrued_days').notNull().default(0),
    usedDays: real('used_days').notNull().default(0),
    year: integer('year').notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('time_off_balances_uniq').on(t.employeeId, t.type, t.year),
  }),
);

export const timeOffRequests = sqliteTable(
  'time_off_requests',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    totalDays: real('total_days').notNull(),
    reason: text('reason'),
    attachmentUrl: text('attachment_url'),
    status: text('status').notNull().default('pending'),
    approverId: text('approver_id').references(() => employees.id),
    decisionNote: text('decision_note'),
    decidedAt: text('decided_at'),
    ...timestamps,
  },
  (t) => ({
    employeeIdx: index('time_off_requests_employee_idx').on(t.employeeId),
    statusIdx: index('time_off_requests_status_idx').on(t.status),
  }),
);

export const companyHolidays = sqliteTable('company_holidays', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  date: text('date').notNull(),
  region: text('region').notNull().default('US'),
});

export const timeOffPolicies = sqliteTable('time_off_policies', {
  id: text('id').primaryKey(),
  type: text('type').notNull().unique(),
  accrual: integer('accrual', { mode: 'boolean' }).notNull().default(false),
  annualAccrualDays: real('annual_accrual_days').notNull().default(0),
  maxCarryoverDays: real('max_carryover_days').notNull().default(0),
  requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(true),
});

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export const timesheets = sqliteTable(
  'timesheets',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    weekStarting: text('week_starting').notNull(),
    status: text('status').notNull().default('draft'),
    approverId: text('approver_id').references(() => employees.id),
    submittedAt: text('submitted_at'),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('timesheets_employee_week_idx').on(t.employeeId, t.weekStarting),
  }),
);

export const timesheetEntries = sqliteTable('timesheet_entries', {
  id: text('id').primaryKey(),
  timesheetId: text('timesheet_id')
    .notNull()
    .references(() => timesheets.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  project: text('project').notNull(),
  task: text('task'),
  hours: real('hours').notNull(),
  notes: text('notes'),
});

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export const compensations = sqliteTable('compensations', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  annualSalaryCents: integer('annual_salary_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  payFrequency: text('pay_frequency').notNull().default('biweekly'),
  effectiveDate: text('effective_date').notNull(),
});

export const payslips = sqliteTable(
  'payslips',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    payDate: text('pay_date').notNull(),
    status: text('status').notNull().default('issued'),
    frequency: text('frequency').notNull().default('biweekly'),
    currency: text('currency').notNull().default('USD'),
    grossCents: integer('gross_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    totalDeductionsCents: integer('total_deductions_cents').notNull(),
    totalTaxCents: integer('total_tax_cents').notNull(),
    totalContributionsCents: integer('total_contributions_cents').notNull().default(0),
    payRunId: text('pay_run_id').references(() => payRuns.id, { onDelete: 'set null' }),
    lines: text('lines').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('payslips_employee_idx').on(t.employeeId),
    payRunIdx: index('payslips_pay_run_idx').on(t.payRunId),
    employeePeriodIdx: uniqueIndex('payslips_employee_period_idx').on(
      t.employeeId,
      t.periodStart,
      t.periodEnd,
    ),
  }),
);

export const payRuns = sqliteTable('pay_runs', {
  id: text('id').primaryKey(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  payDate: text('pay_date').notNull(),
  frequency: text('frequency').notNull().default('biweekly'),
  status: text('status').notNull().default('issued'),
  currency: text('currency').notNull().default('USD'),
  createdById: text('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

// ---------------------------------------------------------------------------
// Benefits
// ---------------------------------------------------------------------------

export const benefitPlans = sqliteTable('benefit_plans', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  carrier: text('carrier').notNull(),
  description: text('description').notNull(),
  monthlyPremiumCents: integer('monthly_premium_cents').notNull(),
  employerContributionCents: integer('employer_contribution_cents').notNull(),
  coverageLevel: text('coverage_level').notNull(),
  planYear: integer('plan_year').notNull(),
});

export const benefitPlanTiers = sqliteTable(
  'benefit_plan_tiers',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => benefitPlans.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    monthlyPremiumCents: integer('monthly_premium_cents').notNull(),
    employerContributionCents: integer('employer_contribution_cents').notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('benefit_plan_tiers_uniq').on(t.planId, t.tier),
  }),
);

export const benefitDependents = sqliteTable(
  'benefit_dependents',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    relationship: text('relationship').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    ...timestamps,
  },
  (t) => ({
    byEmployee: index('benefit_dependents_employee_idx').on(t.employeeId),
  }),
);

export const qualifyingLifeEvents = sqliteTable(
  'qualifying_life_events',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    eventDate: text('event_date').notNull(),
    status: text('status').notNull().default('pending'),
    windowEndsAt: text('window_ends_at').notNull(),
    note: text('note'),
    decidedById: text('decided_by_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    decidedAt: text('decided_at'),
    ...timestamps,
  },
  (t) => ({
    byEmployee: index('qle_employee_idx').on(t.employeeId),
  }),
);

export const enrollmentPeriods = sqliteTable('enrollment_periods', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  planYear: integer('plan_year').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  ...timestamps,
});

export const benefitEnrollments = sqliteTable(
  'benefit_enrollments',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => benefitPlans.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    coverageTier: text('coverage_tier').notNull().default('employee_only'),
    effectiveDate: text('effective_date'),
    endDate: text('end_date'),
    qleId: text('qle_id').references(() => qualifyingLifeEvents.id, {
      onDelete: 'set null',
    }),
    electedAt: text('elected_at'),
    dependents: integer('dependents').notNull().default(0),
    dependentIds: text('dependent_ids').notNull().default('[]'),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('benefit_enrollments_uniq').on(t.employeeId, t.planId),
  }),
);

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id').references(() => reviewCycles.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    progress: integer('progress').notNull().default(0),
    dueDate: text('due_date'),
    ...timestamps,
  },
  (t) => ({
    employeeIdx: index('goals_employee_idx').on(t.employeeId),
    cycleIdx: index('goals_cycle_idx').on(t.cycleId),
  }),
);

export const reviewCycles = sqliteTable('review_cycles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('upcoming'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => reviewCycles.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    reviewerId: text('reviewer_id')
      .notNull()
      .references(() => employees.id),
    status: text('status').notNull().default('not_started'),
    selfAssessment: text('self_assessment'),
    managerAssessment: text('manager_assessment'),
    overallRating: integer('overall_rating'),
    submittedAt: text('submitted_at'),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('reviews_cycle_employee_idx').on(t.cycleId, t.employeeId),
  }),
);

export const oneOnOnes = sqliteTable('one_on_ones', {
  id: text('id').primaryKey(),
  managerId: text('manager_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  scheduledFor: text('scheduled_for').notNull(),
  agenda: text('agenda'),
  notes: text('notes'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const oneOnOneActionItems = sqliteTable(
  'one_on_one_action_items',
  {
    id: text('id').primaryKey(),
    oneOnOneId: text('one_on_one_id')
      .notNull()
      .references(() => oneOnOnes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    assigneeId: text('assignee_id').references(() => employees.id, { onDelete: 'set null' }),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    meetingIdx: index('one_on_one_action_items_meeting_idx').on(t.oneOnOneId),
  }),
);

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

export const jobRequisitions = sqliteTable(
  'job_requisitions',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    department: text('department').notNull(),
    division: text('division'),
    location: text('location').notNull(),
    employmentType: text('employment_type').notNull().default('full_time'),
    status: text('status').notNull().default('draft'),
    description: text('description').notNull(),
    hiringManagerId: text('hiring_manager_id').references(() => employees.id),
    recruiterId: text('recruiter_id').references(() => employees.id),
    openings: integer('openings').notNull().default(1),
    filledCount: integer('filled_count').notNull().default(0),
    postedDate: text('posted_date'),
    closedAt: text('closed_at'),
    approvedById: text('approved_by_id').references(() => employees.id),
    approvedAt: text('approved_at'),
    salaryMinCents: integer('salary_min_cents'),
    salaryMaxCents: integer('salary_max_cents'),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('job_requisitions_status_idx').on(t.status),
  }),
);

export const candidates = sqliteTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    stage: text('stage').notNull().default('applied'),
    resumeUrl: text('resume_url'),
    source: text('source'),
    rating: integer('rating'),
    notes: text('notes'),
    appliedAt: text('applied_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    jobIdx: index('candidates_job_idx').on(t.jobId),
  }),
);

export const candidateStageEvents = sqliteTable(
  'candidate_stage_events',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    fromStage: text('from_stage'),
    toStage: text('to_stage').notNull(),
    note: text('note'),
    changedById: text('changed_by_id').references(() => employees.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    candidateIdx: index('candidate_stage_events_candidate_idx').on(t.candidateId),
  }),
);

export const interviews = sqliteTable(
  'interviews',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    interviewerId: text('interviewer_id')
      .notNull()
      .references(() => employees.id),
    scheduledAt: text('scheduled_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    mode: text('mode').notNull().default('video'),
    stage: text('stage').notNull().default('interview'),
    location: text('location'),
    status: text('status').notNull().default('scheduled'),
    ...timestamps,
  },
  (t) => ({
    candidateIdx: index('interviews_candidate_idx').on(t.candidateId),
    interviewerIdx: index('interviews_interviewer_idx').on(t.interviewerId),
  }),
);

export const interviewScorecards = sqliteTable(
  'interview_scorecards',
  {
    id: text('id').primaryKey(),
    interviewId: text('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    interviewerId: text('interviewer_id')
      .notNull()
      .references(() => employees.id),
    rating: integer('rating').notNull(),
    recommendation: text('recommendation').notNull(),
    strengths: text('strengths'),
    concerns: text('concerns'),
    comments: text('comments'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    interviewIdx: uniqueIndex('interview_scorecards_interview_idx').on(t.interviewId),
    candidateIdx: index('interview_scorecards_candidate_idx').on(t.candidateId),
  }),
);

export const offers = sqliteTable(
  'offers',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    salaryCents: integer('salary_cents').notNull(),
    startDate: text('start_date').notNull(),
    status: text('status').notNull().default('draft'),
    expiresAt: text('expires_at'),
    notes: text('notes'),
    extendedById: text('extended_by_id').references(() => employees.id),
    decidedAt: text('decided_at'),
    ...timestamps,
  },
  (t) => ({
    candidateIdx: index('offers_candidate_idx').on(t.candidateId),
  }),
);

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const onboardingTemplates = sqliteTable(
  'onboarding_templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull().default('onboarding'),
    description: text('description'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    typeIdx: index('onboarding_templates_type_idx').on(t.type),
  }),
);

export const onboardingTemplateItems = sqliteTable(
  'onboarding_template_items',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => onboardingTemplates.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull().default('general'),
    assigneeRole: text('assignee_role').notNull().default('employee'),
    dueOffsetDays: integer('due_offset_days').notNull().default(0),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => ({
    templateIdx: index('onboarding_template_items_template_idx').on(t.templateId),
  }),
);

export const onboardingChecklists = sqliteTable(
  'onboarding_checklists',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    templateId: text('template_id').references(() => onboardingTemplates.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull().default('onboarding'),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    anchorDate: text('anchor_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('onboarding_checklists_employee_idx').on(t.employeeId),
    typeIdx: index('onboarding_checklists_type_idx').on(t.type),
  }),
);

export const onboardingTasks = sqliteTable(
  'onboarding_tasks',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    checklistId: text('checklist_id').references(() => onboardingChecklists.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull().default('general'),
    assigneeRole: text('assignee_role').notNull().default('employee'),
    status: text('status').notNull().default('pending'),
    dueDate: text('due_date'),
    completedAt: text('completed_at'),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => ({
    employeeIdx: index('onboarding_tasks_employee_idx').on(t.employeeId),
    checklistIdx: index('onboarding_tasks_checklist_idx').on(t.checklistId),
  }),
);

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  provider: text('provider').notNull().default('Collins Aerospace University'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const coursePrerequisites = sqliteTable(
  'course_prerequisites',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    prerequisiteId: text('prerequisite_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: uniqueIndex('course_prerequisites_uniq').on(t.courseId, t.prerequisiteId),
    courseIdx: index('course_prerequisites_course_idx').on(t.courseId),
  }),
);

export const courseEnrollments = sqliteTable(
  'course_enrollments',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('not_started'),
    progress: integer('progress').notNull().default(0),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    dueDate: text('due_date'),
    assignedById: text('assigned_by_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    certificateSerial: text('certificate_serial'),
    enrolledAt: text('enrolled_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    completedAt: text('completed_at'),
  },
  (t) => ({
    uniq: uniqueIndex('course_enrollments_uniq').on(t.employeeId, t.courseId),
    employeeIdx: index('course_enrollments_employee_idx').on(t.employeeId),
    courseIdx: index('course_enrollments_course_idx').on(t.courseId),
  }),
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull().default('general'),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    url: text('url').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('active'),
    requiresSignature: integer('requires_signature', { mode: 'boolean' }).notNull().default(false),
    signedAt: text('signed_at'),
    uploadedById: text('uploaded_by_id')
      .notNull()
      .references(() => employees.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('documents_employee_idx').on(t.employeeId),
    categoryIdx: index('documents_category_idx').on(t.category),
    statusIdx: index('documents_status_idx').on(t.status),
  }),
);

// Immutable revision history for a document. Each uploaded revision is appended
// here so prior files remain auditable after the live `documents` row advances.
export const documentVersions = sqliteTable(
  'document_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    url: text('url').notNull(),
    note: text('note'),
    uploadedById: text('uploaded_by_id')
      .notNull()
      .references(() => employees.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    documentIdx: index('document_versions_document_idx').on(t.documentId),
    uniqueVersion: uniqueIndex('document_versions_doc_version_idx').on(t.documentId, t.version),
  }),
);

// Tracked e-signature requests: one row per (document, target employee). The
// row carries the request lifecycle (pending -> signed/declined/cancelled);
// the immutable signature itself is recorded in `documentSignatures`.
export const signatureRequests = sqliteTable(
  'signature_requests',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    requestedById: text('requested_by_id')
      .notNull()
      .references(() => employees.id),
    status: text('status').notNull().default('pending'),
    message: text('message'),
    dueDate: text('due_date'),
    signedAt: text('signed_at'),
    declinedAt: text('declined_at'),
    declineReason: text('decline_reason'),
    remindersSent: integer('reminders_sent').notNull().default(0),
    lastReminderAt: text('last_reminder_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    documentIdx: index('signature_requests_document_idx').on(t.documentId),
    employeeIdx: index('signature_requests_employee_idx').on(t.employeeId),
    uniqueRequest: uniqueIndex('signature_requests_doc_emp_idx').on(t.documentId, t.employeeId),
  }),
);

// Per-employee signatures. Company-wide documents (employeeId null on the
// document) are signed independently by each employee, so signature state
// cannot live on the shared document row.
export const documentSignatures = sqliteTable(
  'document_signatures',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    signedAt: text('signed_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    uniqueSignature: uniqueIndex('document_signatures_doc_emp_idx').on(t.documentId, t.employeeId),
  }),
);

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('notifications_employee_idx').on(t.employeeId),
  }),
);

export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeTypeIdx: uniqueIndex('notification_preferences_employee_type_idx').on(
      t.employeeId,
      t.type,
    ),
  }),
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    metadata: text('metadata'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    actionIdx: index('audit_logs_action_idx').on(t.action),
    entityIdx: index('audit_logs_entity_idx').on(t.entity),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Organization settings (singleton company profile)
// ---------------------------------------------------------------------------

export const orgSettings = sqliteTable('org_settings', {
  id: text('id').primaryKey(),
  legalName: text('legal_name').notNull().default('Collins Aerospace'),
  displayName: text('display_name').notNull().default('Collins Aerospace'),
  parentCompany: text('parent_company').notNull().default('RTX'),
  headquarters: text('headquarters').notNull().default('Charlotte, NC'),
  supportEmail: text('support_email').notNull().default('hr@collins.com'),
  phone: text('phone'),
  website: text('website').notNull().default('https://www.collinsaerospace.com'),
  timezone: text('timezone').notNull().default('America/New_York'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
  divisions: text('divisions').notNull().default('[]'),
  locations: text('locations').notNull().default('[]'),
  departments: text('departments').notNull().default('[]'),
  ...timestamps,
});
