import { and, desc, eq } from 'drizzle-orm';
import type { Course, CourseEnrollment } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { courseEnrollments, courses } from '../db/schema.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toCourse, toCourseEnrollment } from './mappers.js';

export async function listCourses(db: Database, category?: string): Promise<Course[]> {
  const rows = await db
    .select()
    .from(courses)
    .where(category ? eq(courses.category, category) : undefined)
    .orderBy(desc(courses.required), courses.title);
  return rows.map(toCourse);
}

export async function listEnrollments(
  db: Database,
  employeeId: string,
): Promise<CourseEnrollment[]> {
  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.employeeId, employeeId));
  const allCourses = await listCourses(db);
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...toCourseEnrollment(r), course: courseMap.get(r.courseId) }));
}

export async function enroll(
  db: Database,
  employeeId: string,
  courseId: string,
): Promise<CourseEnrollment> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw NotFound('Course not found');
  const [existing] = await db
    .select()
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.employeeId, employeeId),
        eq(courseEnrollments.courseId, courseId),
      ),
    )
    .limit(1);
  if (existing) throw BadRequest('Already enrolled in this course');
  const id = createId('enr');
  await db.insert(courseEnrollments).values({
    id,
    employeeId,
    courseId,
    status: 'not_started',
    progress: 0,
  });
  const [row] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, id))
    .limit(1);
  return toCourseEnrollment(row!);
}

export async function updateProgress(
  db: Database,
  employeeId: string,
  enrollmentId: string,
  progress: number,
): Promise<CourseEnrollment> {
  const [row] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, enrollmentId))
    .limit(1);
  if (!row || row.employeeId !== employeeId) throw NotFound('Enrollment not found');
  const status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
  await db
    .update(courseEnrollments)
    .set({
      progress,
      status,
      completedAt: status === 'completed' ? nowIso() : null,
    })
    .where(eq(courseEnrollments.id, enrollmentId));
  const [updated] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, enrollmentId))
    .limit(1);
  return toCourseEnrollment(updated!);
}
