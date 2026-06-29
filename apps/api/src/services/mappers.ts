import type {
  Address,
  BenefitEnrollment,
  Candidate,
  Course,
  CourseEnrollment,
  Employee,
  EmployeeRef,
  EmergencyContact,
  Goal,
  HrDocument,
  JobRequisition,
  Notification,
  OnboardingTask,
  Payslip,
  PayslipLine,
  Review,
  ReviewCycle,
  Role,
  TimeOffRequest,
  Timesheet,
  TimesheetEntry,
} from '@collins-hr/shared';
import type { InferSelectModel } from 'drizzle-orm';
import type * as schema from '../db/schema.js';

type EmployeeRow = InferSelectModel<typeof schema.employees>;

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function displayName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export function toEmployeeRef(row: EmployeeRow): EmployeeRef {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: displayName(row.firstName, row.lastName),
    jobTitle: row.jobTitle,
    department: row.department,
    avatarUrl: row.avatarUrl,
    email: row.email,
  };
}

export function toEmployee(row: EmployeeRow, roles: Role[]): Employee {
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: displayName(row.firstName, row.lastName),
    email: row.email,
    workPhone: row.workPhone,
    personalPhone: row.personalPhone,
    jobTitle: row.jobTitle,
    department: row.department,
    division: row.division,
    location: row.location,
    employmentType: row.employmentType as Employee['employmentType'],
    status: row.status as Employee['status'],
    managerId: row.managerId,
    hireDate: row.hireDate,
    terminationDate: row.terminationDate,
    dateOfBirth: row.dateOfBirth,
    avatarUrl: row.avatarUrl,
    roles,
    address: parseJson<Address>(row.address),
    emergencyContact: parseJson<EmergencyContact>(row.emergencyContact),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTimeOffRequest(
  row: InferSelectModel<typeof schema.timeOffRequests>,
  relations: { employee?: EmployeeRef; approver?: EmployeeRef | null } = {},
): TimeOffRequest {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employee: relations.employee,
    type: row.type as TimeOffRequest['type'],
    startDate: row.startDate,
    endDate: row.endDate,
    totalDays: row.totalDays,
    reason: row.reason,
    status: row.status as TimeOffRequest['status'],
    approverId: row.approverId,
    approver: relations.approver ?? undefined,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTimesheet(
  row: InferSelectModel<typeof schema.timesheets>,
  entries: InferSelectModel<typeof schema.timesheetEntries>[],
): Timesheet {
  const mapped: TimesheetEntry[] = entries.map((e) => ({
    id: e.id,
    date: e.date,
    project: e.project,
    hours: e.hours,
    notes: e.notes,
  }));
  return {
    id: row.id,
    employeeId: row.employeeId,
    weekStarting: row.weekStarting,
    status: row.status as Timesheet['status'],
    totalHours: mapped.reduce((sum, e) => sum + e.hours, 0),
    entries: mapped,
    approverId: row.approverId,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPayslip(row: InferSelectModel<typeof schema.payslips>): Payslip {
  return {
    id: row.id,
    employeeId: row.employeeId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payDate: row.payDate,
    status: row.status as Payslip['status'],
    currency: row.currency,
    grossCents: row.grossCents,
    netCents: row.netCents,
    totalDeductionsCents: row.totalDeductionsCents,
    totalTaxCents: row.totalTaxCents,
    lines: parseJson<PayslipLine[]>(row.lines) ?? [],
    createdAt: row.createdAt,
  };
}

export function toBenefitEnrollment(
  row: InferSelectModel<typeof schema.benefitEnrollments>,
): BenefitEnrollment {
  return {
    id: row.id,
    employeeId: row.employeeId,
    planId: row.planId,
    status: row.status as BenefitEnrollment['status'],
    electedAt: row.electedAt,
    dependents: row.dependents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toGoal(row: InferSelectModel<typeof schema.goals>): Goal {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    description: row.description,
    status: row.status as Goal['status'],
    progress: row.progress,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toReviewCycle(row: InferSelectModel<typeof schema.reviewCycles>): ReviewCycle {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ReviewCycle['status'],
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
  };
}

export function toReview(
  row: InferSelectModel<typeof schema.reviews>,
  relations: { cycle?: ReviewCycle; employee?: EmployeeRef; reviewer?: EmployeeRef } = {},
): Review {
  return {
    id: row.id,
    cycleId: row.cycleId,
    cycle: relations.cycle,
    employeeId: row.employeeId,
    employee: relations.employee,
    reviewerId: row.reviewerId,
    reviewer: relations.reviewer,
    status: row.status as Review['status'],
    selfAssessment: row.selfAssessment,
    managerAssessment: row.managerAssessment,
    overallRating: row.overallRating,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJob(
  row: InferSelectModel<typeof schema.jobRequisitions>,
  candidateCount?: number,
): JobRequisition {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    location: row.location,
    employmentType: row.employmentType,
    status: row.status as JobRequisition['status'],
    description: row.description,
    hiringManagerId: row.hiringManagerId,
    recruiterId: row.recruiterId,
    openings: row.openings,
    postedDate: row.postedDate,
    salaryMinCents: row.salaryMinCents,
    salaryMaxCents: row.salaryMaxCents,
    candidateCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toCandidate(row: InferSelectModel<typeof schema.candidates>): Candidate {
  return {
    id: row.id,
    jobId: row.jobId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    stage: row.stage as Candidate['stage'],
    resumeUrl: row.resumeUrl,
    source: row.source,
    rating: row.rating,
    notes: row.notes,
    appliedAt: row.appliedAt,
    updatedAt: row.updatedAt,
  };
}

export function toOnboardingTask(
  row: InferSelectModel<typeof schema.onboardingTasks>,
): OnboardingTask {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    description: row.description,
    category: row.category,
    assigneeRole: row.assigneeRole,
    status: row.status as OnboardingTask['status'],
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    orderIndex: row.orderIndex,
  };
}

export function toCourse(row: InferSelectModel<typeof schema.courses>): Course {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    provider: row.provider,
    durationMinutes: row.durationMinutes,
    required: row.required,
    createdAt: row.createdAt,
  };
}

export function toCourseEnrollment(
  row: InferSelectModel<typeof schema.courseEnrollments>,
): CourseEnrollment {
  return {
    id: row.id,
    employeeId: row.employeeId,
    courseId: row.courseId,
    status: row.status as CourseEnrollment['status'],
    progress: row.progress,
    enrolledAt: row.enrolledAt,
    completedAt: row.completedAt,
  };
}

export function toDocument(
  row: InferSelectModel<typeof schema.documents>,
  signedAt: string | null = row.signedAt,
): HrDocument {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    category: row.category,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    requiresSignature: row.requiresSignature,
    signedAt,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt,
  };
}

export function toNotification(
  row: InferSelectModel<typeof schema.notifications>,
): Notification {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type as Notification['type'],
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    createdAt: row.createdAt,
  };
}
