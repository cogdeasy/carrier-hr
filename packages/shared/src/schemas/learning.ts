import { z } from 'zod';
import { COURSE_CATEGORIES, COURSE_SORTS, COURSE_STATUSES } from '../enums.js';
import { employeeRefSchema } from './employee.js';

export const courseRefSchema = z.object({
  id: z.string(),
  title: z.string(),
});
export type CourseRef = z.infer<typeof courseRefSchema>;

export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  provider: z.string(),
  durationMinutes: z.number().int(),
  required: z.boolean(),
  prerequisiteIds: z.array(z.string()),
  prerequisites: z.array(courseRefSchema),
  enrollmentCount: z.number().int().optional(),
  createdAt: z.string(),
});
export type Course = z.infer<typeof courseSchema>;

export const enrollmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  courseId: z.string(),
  course: courseSchema.optional(),
  status: z.enum(COURSE_STATUSES),
  progress: z.number().int().min(0).max(100),
  required: z.boolean(),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
  assignedById: z.string().nullable(),
  assignedBy: employeeRefSchema.nullable().optional(),
  certificateSerial: z.string().nullable(),
  enrolledAt: z.string(),
  completedAt: z.string().nullable(),
});
export type CourseEnrollment = z.infer<typeof enrollmentSchema>;

export const teamEnrollmentSchema = enrollmentSchema.extend({
  employee: employeeRefSchema,
});
export type TeamEnrollment = z.infer<typeof teamEnrollmentSchema>;

export const listCoursesQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  required: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  sort: z.enum(COURSE_SORTS).default('title'),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

const titleField = z.string().trim().min(2).max(160);
const descriptionField = z.string().trim().min(2).max(2000);
const categoryField = z.enum(COURSE_CATEGORIES);

export const createCourseSchema = z.object({
  title: titleField,
  category: categoryField,
  description: descriptionField,
  provider: z.string().trim().min(2).max(120).default('Collins Aerospace University'),
  durationMinutes: z.number().int().min(1).max(100000),
  required: z.boolean().default(false),
  prerequisiteIds: z.array(z.string()).max(20).default([]),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z
  .object({
    title: titleField,
    category: categoryField,
    description: descriptionField,
    provider: z.string().trim().min(2).max(120),
    durationMinutes: z.number().int().min(1).max(100000),
    required: z.boolean(),
    prerequisiteIds: z.array(z.string()).max(20),
  })
  .partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const enrollCourseSchema = z.object({
  courseId: z.string(),
});
export type EnrollCourseInput = z.infer<typeof enrollCourseSchema>;

export const updateEnrollmentSchema = z.object({
  progress: z.number().int().min(0).max(100),
});
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const assignCourseSchema = z.object({
  courseId: z.string(),
  employeeIds: z.array(z.string()).min(1).max(500),
  dueDate: isoDate.nullable().optional(),
});
export type AssignCourseInput = z.infer<typeof assignCourseSchema>;

export const complianceRowSchema = z.object({
  employee: employeeRefSchema,
  assigned: z.number().int(),
  completed: z.number().int(),
  overdue: z.number().int(),
  compliancePct: z.number().int(),
});
export type ComplianceRow = z.infer<typeof complianceRowSchema>;

export const courseComplianceSchema = z.object({
  course: courseRefSchema,
  assigned: z.number().int(),
  completed: z.number().int(),
  overdue: z.number().int(),
  compliancePct: z.number().int(),
});
export type CourseCompliance = z.infer<typeof courseComplianceSchema>;

export const complianceReportSchema = z.object({
  summary: z.object({
    employees: z.number().int(),
    assigned: z.number().int(),
    completed: z.number().int(),
    overdue: z.number().int(),
    compliancePct: z.number().int(),
  }),
  byEmployee: z.array(complianceRowSchema),
  byCourse: z.array(courseComplianceSchema),
  overdue: z.array(teamEnrollmentSchema),
});
export type ComplianceReport = z.infer<typeof complianceReportSchema>;
