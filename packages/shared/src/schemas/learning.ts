import { z } from 'zod';
import { COURSE_STATUSES } from '../enums.js';

export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  provider: z.string(),
  durationMinutes: z.number().int(),
  required: z.boolean(),
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
  enrolledAt: z.string(),
  completedAt: z.string().nullable(),
});
export type CourseEnrollment = z.infer<typeof enrollmentSchema>;

export const enrollCourseSchema = z.object({
  courseId: z.string(),
});
export type EnrollCourseInput = z.infer<typeof enrollCourseSchema>;

export const updateEnrollmentSchema = z.object({
  progress: z.number().int().min(0).max(100),
});
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
