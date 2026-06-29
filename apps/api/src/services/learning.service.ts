import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  AssignCourseInput,
  ComplianceReport,
  Course,
  CourseEnrollment,
  CourseRef,
  CreateCourseInput,
  ListCoursesQuery,
  TeamEnrollment,
  UpdateCourseInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { courseEnrollments, coursePrerequisites, courses, employees } from '../db/schema.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { toCourse, toCourseEnrollment, toEmployeeRef } from './mappers.js';

const PROVIDER = 'Collins Aerospace University';

type CourseRow = typeof courses.$inferSelect;
type EnrollmentRow = typeof courseEnrollments.$inferSelect;

function statusForProgress(progress: number): CourseEnrollment['status'] {
  if (progress >= 100) return 'completed';
  if (progress > 0) return 'in_progress';
  return 'not_started';
}

function certificateSerial(): string {
  return `CAU-${new Date().getUTCFullYear()}-${createId('c').slice(2, 10).toUpperCase()}`;
}

async function prerequisiteMap(
  db: Database,
  courseIds: string[],
): Promise<Map<string, CourseRef[]>> {
  const map = new Map<string, CourseRef[]>();
  if (courseIds.length === 0) return map;
  const links = await db
    .select()
    .from(coursePrerequisites)
    .where(inArray(coursePrerequisites.courseId, courseIds));
  if (links.length === 0) return map;
  const prereqIds = [...new Set(links.map((l) => l.prerequisiteId))];
  const titleRows = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(inArray(courses.id, prereqIds));
  const titles = new Map(titleRows.map((r) => [r.id, r]));
  for (const link of links) {
    const ref = titles.get(link.prerequisiteId);
    if (!ref) continue;
    const list = map.get(link.courseId) ?? [];
    list.push(ref);
    map.set(link.courseId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title));
  return map;
}

async function enrollmentCounts(
  db: Database,
  courseIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (courseIds.length === 0) return map;
  const rows = await db
    .select({ courseId: courseEnrollments.courseId, count: sql<number>`count(*)` })
    .from(courseEnrollments)
    .where(inArray(courseEnrollments.courseId, courseIds))
    .groupBy(courseEnrollments.courseId);
  for (const r of rows) map.set(r.courseId, Number(r.count));
  return map;
}

function hydrateCourses(
  rows: CourseRow[],
  prereqs: Map<string, CourseRef[]>,
  counts: Map<string, number>,
): Course[] {
  return rows.map((row) =>
    toCourse(row, {
      prerequisites: prereqs.get(row.id) ?? [],
      enrollmentCount: counts.get(row.id) ?? 0,
    }),
  );
}

export async function listCourses(db: Database, query: ListCoursesQuery): Promise<Course[]> {
  const conditions = [];
  if (query.category) conditions.push(eq(courses.category, query.category));
  if (query.provider) conditions.push(eq(courses.provider, query.provider));
  if (query.required !== undefined) conditions.push(eq(courses.required, query.required));
  if (query.search) {
    const term = `%${query.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${courses.title}) like ${term} or lower(${courses.description}) like ${term})`,
    );
  }

  const order =
    query.sort === 'duration'
      ? [asc(courses.durationMinutes), asc(courses.title)]
      : query.sort === 'recent'
        ? [desc(courses.createdAt)]
        : [desc(courses.required), asc(courses.title)];

  const rows = await db
    .select()
    .from(courses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...order);

  const ids = rows.map((r) => r.id);
  const [prereqs, counts] = await Promise.all([
    prerequisiteMap(db, ids),
    enrollmentCounts(db, ids),
  ]);
  return hydrateCourses(rows, prereqs, counts);
}

export async function getCourse(db: Database, id: string): Promise<Course> {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!row) throw NotFound('Course not found');
  const [prereqs, counts] = await Promise.all([
    prerequisiteMap(db, [id]),
    enrollmentCounts(db, [id]),
  ]);
  return hydrateCourses([row], prereqs, counts)[0]!;
}

async function assertCoursesExist(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: courses.id })
    .from(courses)
    .where(inArray(courses.id, ids));
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw BadRequest('Unknown prerequisite course', { missing });
}

/** True when `targetId` is reachable from `startId` along course→prerequisite edges. */
async function dependsOn(db: Database, startId: string, targetId: string): Promise<boolean> {
  const visited = new Set<string>();
  let frontier = [startId];
  while (frontier.length) {
    const links = await db
      .select({ prerequisiteId: coursePrerequisites.prerequisiteId })
      .from(coursePrerequisites)
      .where(inArray(coursePrerequisites.courseId, frontier));
    const next: string[] = [];
    for (const link of links) {
      if (link.prerequisiteId === targetId) return true;
      if (!visited.has(link.prerequisiteId)) {
        visited.add(link.prerequisiteId);
        next.push(link.prerequisiteId);
      }
    }
    frontier = next;
  }
  return false;
}

async function setPrerequisites(
  db: Database,
  courseId: string,
  prerequisiteIds: string[],
): Promise<void> {
  const unique = [...new Set(prerequisiteIds)];
  if (unique.includes(courseId)) throw BadRequest('A course cannot require itself');
  await assertCoursesExist(db, unique);
  for (const prereqId of unique) {
    if (await dependsOn(db, prereqId, courseId)) {
      throw BadRequest('Prerequisite would create a cycle', { prereqId });
    }
  }
  await db.delete(coursePrerequisites).where(eq(coursePrerequisites.courseId, courseId));
  if (unique.length) {
    await db.insert(coursePrerequisites).values(
      unique.map((prerequisiteId) => ({
        id: createId('cpr'),
        courseId,
        prerequisiteId,
      })),
    );
  }
}

export async function createCourse(db: Database, input: CreateCourseInput): Promise<Course> {
  const id = createId('crs');
  await db.insert(courses).values({
    id,
    title: input.title,
    category: input.category,
    description: input.description,
    provider: input.provider || PROVIDER,
    durationMinutes: input.durationMinutes,
    required: input.required,
  });
  await setPrerequisites(db, id, input.prerequisiteIds);
  return getCourse(db, id);
}

export async function updateCourse(
  db: Database,
  id: string,
  input: UpdateCourseInput,
): Promise<Course> {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!row) throw NotFound('Course not found');
  const patch: Partial<CourseRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
  if (input.required !== undefined) patch.required = input.required;
  if (Object.keys(patch).length) {
    await db.update(courses).set(patch).where(eq(courses.id, id));
  }
  if (input.prerequisiteIds !== undefined) {
    await setPrerequisites(db, id, input.prerequisiteIds);
  }
  return getCourse(db, id);
}

export async function deleteCourse(db: Database, id: string): Promise<void> {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!row) throw NotFound('Course not found');
  await db.delete(courses).where(eq(courses.id, id));
}

async function coursesByIds(db: Database, ids: string[]): Promise<Map<string, Course>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(courses).where(inArray(courses.id, ids));
  const [prereqs, counts] = await Promise.all([
    prerequisiteMap(db, ids),
    enrollmentCounts(db, ids),
  ]);
  return new Map(hydrateCourses(rows, prereqs, counts).map((c) => [c.id, c]));
}

function sortEnrollments(list: CourseEnrollment[]): CourseEnrollment[] {
  const rank = (e: CourseEnrollment): number => {
    if (e.overdue) return 0;
    if (e.required && e.status !== 'completed') return 1;
    if (e.status !== 'completed') return 2;
    return 3;
  };
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.enrolledAt.localeCompare(a.enrolledAt);
  });
}

export async function listEnrollments(
  db: Database,
  employeeId: string,
): Promise<CourseEnrollment[]> {
  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.employeeId, employeeId));
  const courseMap = await coursesByIds(db, [...new Set(rows.map((r) => r.courseId))]);
  const today = isoToday();
  const hydrated = rows.map((r) =>
    toCourseEnrollment(r, { course: courseMap.get(r.courseId), today }),
  );
  return sortEnrollments(hydrated);
}

async function completedCourseIds(db: Database, employeeId: string): Promise<Set<string>> {
  const rows = await db
    .select({ courseId: courseEnrollments.courseId })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.employeeId, employeeId),
        eq(courseEnrollments.status, 'completed'),
      ),
    );
  return new Set(rows.map((r) => r.courseId));
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
  if (existing) throw Conflict('Already enrolled in this course');

  const prereqs = (await prerequisiteMap(db, [courseId])).get(courseId) ?? [];
  if (prereqs.length) {
    const done = await completedCourseIds(db, employeeId);
    const missing = prereqs.filter((p) => !done.has(p.id));
    if (missing.length) {
      throw BadRequest('Complete the prerequisites first', {
        prerequisites: missing.map((p) => p.title),
      });
    }
  }

  const id = createId('enr');
  await db.insert(courseEnrollments).values({
    id,
    employeeId,
    courseId,
    status: 'not_started',
    progress: 0,
    required: course.required,
  });
  return getEnrollment(db, id);
}

async function getEnrollment(db: Database, id: string): Promise<CourseEnrollment> {
  const [row] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, id))
    .limit(1);
  if (!row) throw NotFound('Enrollment not found');
  const courseMap = await coursesByIds(db, [row.courseId]);
  return toCourseEnrollment(row, { course: courseMap.get(row.courseId), today: isoToday() });
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
  if (!row) throw NotFound('Enrollment not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only update your own learning');

  const status = statusForProgress(progress);
  const completed = status === 'completed';
  await db
    .update(courseEnrollments)
    .set({
      progress,
      status,
      completedAt: completed ? (row.completedAt ?? nowIso()) : null,
      certificateSerial: completed
        ? (row.certificateSerial ?? certificateSerial())
        : null,
    })
    .where(eq(courseEnrollments.id, enrollmentId));
  return getEnrollment(db, enrollmentId);
}

export async function unenroll(
  db: Database,
  employeeId: string,
  enrollmentId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, enrollmentId))
    .limit(1);
  if (!row) throw NotFound('Enrollment not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only manage your own learning');
  if (row.required) throw Forbidden('Required courses cannot be dropped');
  await db.delete(courseEnrollments).where(eq(courseEnrollments.id, enrollmentId));
}

export async function assignCourse(
  db: Database,
  assignerId: string,
  input: AssignCourseInput,
): Promise<{ assigned: number; enrollments: CourseEnrollment[] }> {
  const [course] = await db.select().from(courses).where(eq(courses.id, input.courseId)).limit(1);
  if (!course) throw NotFound('Course not found');

  const employeeIds = [...new Set(input.employeeIds)];
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, employeeIds));
  const valid = new Set(empRows.map((e) => e.id));
  const unknown = employeeIds.filter((id) => !valid.has(id));
  if (unknown.length) throw BadRequest('Unknown employees', { employeeIds: unknown });

  const dueDate = input.dueDate ?? null;
  const existing = await db
    .select()
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.courseId, input.courseId),
        inArray(courseEnrollments.employeeId, employeeIds),
      ),
    );
  const existingByEmployee = new Map(existing.map((e) => [e.employeeId, e]));

  const affectedIds: string[] = [];
  for (const employeeId of employeeIds) {
    const current = existingByEmployee.get(employeeId);
    if (current) {
      await db
        .update(courseEnrollments)
        .set({ required: true, dueDate, assignedById: assignerId })
        .where(eq(courseEnrollments.id, current.id));
      affectedIds.push(current.id);
    } else {
      const id = createId('enr');
      await db.insert(courseEnrollments).values({
        id,
        employeeId,
        courseId: input.courseId,
        status: 'not_started',
        progress: 0,
        required: true,
        dueDate,
        assignedById: assignerId,
      });
      affectedIds.push(id);
    }
  }

  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(inArray(courseEnrollments.id, affectedIds));
  const courseMap = await coursesByIds(db, [input.courseId]);
  const today = isoToday();
  const enrollments = rows.map((r) =>
    toCourseEnrollment(r, { course: courseMap.get(r.courseId), today }),
  );
  return { assigned: enrollments.length, enrollments };
}

async function hydrateTeam(
  db: Database,
  rows: EnrollmentRow[],
): Promise<TeamEnrollment[]> {
  const courseMap = await coursesByIds(db, [...new Set(rows.map((r) => r.courseId))]);
  const employeeIds = [
    ...new Set([
      ...rows.map((r) => r.employeeId),
      ...rows.map((r) => r.assignedById).filter((id): id is string => id != null),
    ]),
  ];
  const empRows = employeeIds.length
    ? await db.select().from(employees).where(inArray(employees.id, employeeIds))
    : [];
  const empMap = new Map(empRows.map((e) => [e.id, toEmployeeRef(e)]));
  const today = isoToday();
  return rows.map((r) => {
    const base = toCourseEnrollment(r, {
      course: courseMap.get(r.courseId),
      assignedBy: r.assignedById ? (empMap.get(r.assignedById) ?? null) : null,
      today,
    });
    return { ...base, employee: empMap.get(r.employeeId)! };
  });
}

export async function listTeamEnrollments(
  db: Database,
  scope?: { employeeIds?: string[] },
): Promise<TeamEnrollment[]> {
  if (scope?.employeeIds && scope.employeeIds.length === 0) return [];
  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(
      scope?.employeeIds
        ? inArray(courseEnrollments.employeeId, scope.employeeIds)
        : undefined,
    );
  const hydrated = await hydrateTeam(db, rows);
  return sortEnrollments(hydrated) as TeamEnrollment[];
}

function pct(completed: number, assigned: number): number {
  return assigned === 0 ? 100 : Math.round((completed / assigned) * 100);
}

export async function complianceReport(
  db: Database,
  scope?: { employeeIds?: string[] },
): Promise<ComplianceReport> {
  if (scope?.employeeIds && scope.employeeIds.length === 0) {
    return {
      summary: { employees: 0, assigned: 0, completed: 0, overdue: 0, compliancePct: 100 },
      byEmployee: [],
      byCourse: [],
      overdue: [],
    };
  }
  const conditions = [eq(courseEnrollments.required, true)];
  if (scope?.employeeIds) conditions.push(inArray(courseEnrollments.employeeId, scope.employeeIds));
  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(and(...conditions));
  const enrollments = await hydrateTeam(db, rows);

  const byEmployeeMap = new Map<
    string,
    { employee: TeamEnrollment['employee']; assigned: number; completed: number; overdue: number }
  >();
  const byCourseMap = new Map<
    string,
    { course: { id: string; title: string }; assigned: number; completed: number; overdue: number }
  >();
  let assigned = 0;
  let completed = 0;
  let overdue = 0;

  for (const e of enrollments) {
    assigned += 1;
    const isDone = e.status === 'completed';
    if (isDone) completed += 1;
    if (e.overdue) overdue += 1;

    const emp = byEmployeeMap.get(e.employeeId) ?? {
      employee: e.employee,
      assigned: 0,
      completed: 0,
      overdue: 0,
    };
    emp.assigned += 1;
    if (isDone) emp.completed += 1;
    if (e.overdue) emp.overdue += 1;
    byEmployeeMap.set(e.employeeId, emp);

    const courseRef = e.course ? { id: e.course.id, title: e.course.title } : { id: e.courseId, title: 'Course' };
    const crs = byCourseMap.get(e.courseId) ?? {
      course: courseRef,
      assigned: 0,
      completed: 0,
      overdue: 0,
    };
    crs.assigned += 1;
    if (isDone) crs.completed += 1;
    if (e.overdue) crs.overdue += 1;
    byCourseMap.set(e.courseId, crs);
  }

  const byEmployee = [...byEmployeeMap.values()]
    .map((r) => ({ ...r, compliancePct: pct(r.completed, r.assigned) }))
    .sort((a, b) => b.overdue - a.overdue || a.compliancePct - b.compliancePct);
  const byCourse = [...byCourseMap.values()]
    .map((r) => ({ ...r, compliancePct: pct(r.completed, r.assigned) }))
    .sort((a, b) => b.overdue - a.overdue || a.compliancePct - b.compliancePct);
  const overdueList = enrollments
    .filter((e) => e.overdue)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  return {
    summary: {
      employees: byEmployeeMap.size,
      assigned,
      completed,
      overdue,
      compliancePct: pct(completed, assigned),
    },
    byEmployee,
    byCourse,
    overdue: overdueList,
  };
}
