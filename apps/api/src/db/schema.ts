import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Full relational schema for the Carrier HR platform.
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
    division: text('division').notNull().default('Carrier'),
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
    currency: text('currency').notNull().default('USD'),
    grossCents: integer('gross_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    totalDeductionsCents: integer('total_deductions_cents').notNull(),
    totalTaxCents: integer('total_tax_cents').notNull(),
    lines: text('lines').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('payslips_employee_idx').on(t.employeeId),
  }),
);

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
    electedAt: text('elected_at'),
    dependents: integer('dependents').notNull().default(0),
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
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    progress: integer('progress').notNull().default(0),
    dueDate: text('due_date'),
    ...timestamps,
  },
  (t) => ({
    employeeIdx: index('goals_employee_idx').on(t.employeeId),
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

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

export const jobRequisitions = sqliteTable(
  'job_requisitions',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    department: text('department').notNull(),
    location: text('location').notNull(),
    employmentType: text('employment_type').notNull().default('full_time'),
    status: text('status').notNull().default('draft'),
    description: text('description').notNull(),
    hiringManagerId: text('hiring_manager_id').references(() => employees.id),
    recruiterId: text('recruiter_id').references(() => employees.id),
    openings: integer('openings').notNull().default(1),
    postedDate: text('posted_date'),
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

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const onboardingTasks = sqliteTable(
  'onboarding_tasks',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
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
  provider: text('provider').notNull().default('Carrier University'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

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
    enrolledAt: text('enrolled_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    completedAt: text('completed_at'),
  },
  (t) => ({
    uniq: uniqueIndex('course_enrollments_uniq').on(t.employeeId, t.courseId),
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
    category: text('category').notNull().default('general'),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    url: text('url').notNull(),
    requiresSignature: integer('requires_signature', { mode: 'boolean' }).notNull().default(false),
    signedAt: text('signed_at'),
    uploadedById: text('uploaded_by_id')
      .notNull()
      .references(() => employees.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    employeeIdx: index('documents_employee_idx').on(t.employeeId),
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

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  metadata: text('metadata'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
