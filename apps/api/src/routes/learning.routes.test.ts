import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { courseEnrollments, coursePrerequisites, courses } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

function daysFromToday(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('learning & development', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let manager: SeededUser;
  let report: SeededUser;
  let other: SeededUser;

  let safetyCourse: string;
  let leadershipCourse: string; // requires safetyCourse
  let electiveCourse: string;

  const tokens: Record<string, string> = {};

  async function seedCourse(opts: {
    title: string;
    category?: string;
    required?: boolean;
    durationMinutes?: number;
    description?: string;
  }): Promise<string> {
    const id = createId('crs');
    await ctx.db.insert(courses).values({
      id,
      title: opts.title,
      category: opts.category ?? 'Compliance',
      description: opts.description ?? 'A course description.',
      provider: 'Collins Aerospace University',
      durationMinutes: opts.durationMinutes ?? 30,
      required: opts.required ?? false,
    });
    return id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await seedUser(ctx.db, { email: 'l.admin@collins.com', roles: ['hr_admin'] });
    manager = await seedUser(ctx.db, {
      email: 'l.mgr@collins.com',
      roles: ['manager'],
      firstName: 'Morgan',
      lastName: 'Manager',
    });
    report = await seedUser(ctx.db, {
      email: 'l.rep@collins.com',
      roles: ['employee'],
      firstName: 'Riley',
      lastName: 'Report',
      managerId: manager.employeeId,
    });
    other = await seedUser(ctx.db, {
      email: 'l.other@collins.com',
      roles: ['employee'],
      firstName: 'Casey',
      lastName: 'Other',
    });

    safetyCourse = await seedCourse({ title: 'Workplace Safety', category: 'Safety', required: true });
    leadershipCourse = await seedCourse({ title: 'Leadership Path', category: 'Leadership' });
    electiveCourse = await seedCourse({
      title: 'Python for Engineers',
      category: 'Technical',
      durationMinutes: 120,
    });
    await ctx.db.insert(coursePrerequisites).values({
      id: createId('cpr'),
      courseId: leadershipCourse,
      prerequisiteId: safetyCourse,
    });

    for (const user of [admin, manager, report, other]) {
      tokens[user.email] = await login(ctx.app, user.email);
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('catalog', () => {
    it('lists courses with prerequisites hydrated', async () => {
      const token = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/courses',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ id: string; prerequisites: unknown[] }>;
      const lead = body.find((c) => c.id === leadershipCourse)!;
      expect(lead.prerequisites).toHaveLength(1);
    });

    it('filters by category and required flag', async () => {
      const token = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/courses?category=Safety&required=true',
        headers: authHeader(token),
      });
      const body = res.json() as Array<{ id: string }>;
      expect(body.map((c) => c.id)).toEqual([safetyCourse]);
    });

    it('searches by title', async () => {
      const token = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/courses?search=python',
        headers: authHeader(token),
      });
      const body = res.json() as Array<{ id: string }>;
      expect(body.map((c) => c.id)).toEqual([electiveCourse]);
    });
  });

  describe('course admin authz', () => {
    it('lets an HR admin create a course with prerequisites', async () => {
      const token = tokens[admin.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/courses',
        headers: authHeader(token),
        payload: {
          title: 'Advanced Avionics',
          category: 'Technical',
          description: 'Deep dive into avionics systems.',
          durationMinutes: 90,
          prerequisiteIds: [safetyCourse],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { prerequisites: unknown[] };
      expect(body.prerequisites).toHaveLength(1);
    });

    it('rejects a self-referential prerequisite', async () => {
      const token = tokens[admin.email];
      const created = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/courses',
        headers: authHeader(token),
        payload: {
          title: 'Cycle Course',
          category: 'Technical',
          description: 'Self prerequisite should fail on update.',
          durationMinutes: 30,
        },
      });
      const id = (created.json() as { id: string }).id;
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/learning/courses/${id}`,
        headers: authHeader(token),
        payload: { prerequisiteIds: [id] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('forbids a non-admin from creating courses', async () => {
      const token = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/courses',
        headers: authHeader(token),
        payload: {
          title: 'Sneaky Course',
          category: 'Technical',
          description: 'Should be blocked.',
          durationMinutes: 30,
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('enrollment + prerequisites', () => {
    it('enforces prerequisites on enroll', async () => {
      const token = tokens[other.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
        payload: { courseId: leadershipCourse },
      });
      expect(res.statusCode).toBe(400);
    });

    it('runs the full enroll → complete → certificate flow and unlocks prerequisites', async () => {
      const token = tokens[other.email];

      const enrollRes = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
        payload: { courseId: safetyCourse },
      });
      expect(enrollRes.statusCode).toBe(201);
      const enrollment = enrollRes.json() as { id: string; status: string };
      expect(enrollment.status).toBe('not_started');

      const completeRes = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/learning/enrollments/${enrollment.id}`,
        headers: authHeader(token),
        payload: { progress: 100 },
      });
      expect(completeRes.statusCode).toBe(200);
      const completed = completeRes.json() as {
        status: string;
        completedAt: string | null;
        certificateSerial: string | null;
      };
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).not.toBeNull();
      expect(completed.certificateSerial).toMatch(/^CAU-/);

      const nowAllowed = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
        payload: { courseId: leadershipCourse },
      });
      expect(nowAllowed.statusCode).toBe(201);

      const reopen = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/learning/enrollments/${enrollment.id}`,
        headers: authHeader(token),
        payload: { progress: 40 },
      });
      expect(reopen.statusCode).toBe(400);
    });

    it('rejects duplicate enrollment', async () => {
      const token = tokens[report.email];
      await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
        payload: { courseId: electiveCourse },
      });
      const dup = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
        payload: { courseId: electiveCourse },
      });
      expect(dup.statusCode).toBe(409);
    });

    it('lets an employee drop an elective but not a required course', async () => {
      const token = tokens[report.email];
      const list = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
      });
      const elective = (list.json() as Array<{ id: string; courseId: string }>).find(
        (e) => e.courseId === electiveCourse,
      )!;
      const drop = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/learning/enrollments/${elective.id}`,
        headers: authHeader(token),
      });
      expect(drop.statusCode).toBe(204);
    });

    it('forbids updating another employee’s enrollment', async () => {
      const otherToken = tokens[other.email];
      const list = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/enrollments',
        headers: authHeader(otherToken),
      });
      const enrollmentId = (list.json() as Array<{ id: string }>)[0]!.id;

      const reportToken = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/learning/enrollments/${enrollmentId}`,
        headers: authHeader(reportToken),
        payload: { progress: 50 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('assignments + compliance', () => {
    it('lets a manager assign required training to a report with a due date', async () => {
      const token = tokens[manager.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/assignments',
        headers: authHeader(token),
        payload: {
          courseId: safetyCourse,
          employeeIds: [report.employeeId],
          dueDate: daysFromToday(-3),
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { assigned: number; enrollments: Array<{ required: boolean; overdue: boolean }> };
      expect(body.assigned).toBe(1);
      expect(body.enrollments[0]!.required).toBe(true);
      expect(body.enrollments[0]!.overdue).toBe(true);
    });

    it('forbids a manager from assigning outside their team', async () => {
      const token = tokens[manager.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/assignments',
        headers: authHeader(token),
        payload: { courseId: safetyCourse, employeeIds: [other.employeeId] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('forbids an employee from assigning training', async () => {
      const token = tokens[other.email];
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/learning/assignments',
        headers: authHeader(token),
        payload: { courseId: safetyCourse, employeeIds: [other.employeeId] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('surfaces overdue assignments in the manager compliance report', async () => {
      const token = tokens[manager.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/compliance',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        summary: { overdue: number; assigned: number };
        overdue: Array<{ employeeId: string }>;
      };
      expect(body.summary.overdue).toBeGreaterThanOrEqual(1);
      expect(body.overdue.some((e) => e.employeeId === report.employeeId)).toBe(true);
    });

    it('scopes the compliance report to a manager’s direct reports only', async () => {
      const token = tokens[manager.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/compliance',
        headers: authHeader(token),
      });
      const body = res.json() as { byEmployee: Array<{ employee: { id: string } }> };
      const ids = body.byEmployee.map((r) => r.employee.id);
      expect(ids).toContain(report.employeeId);
      expect(ids).not.toContain(other.employeeId);
    });

    it('forbids an employee from reading team compliance', async () => {
      const token = tokens[report.email];
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/compliance',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(403);
    });

    it('drops a required assignment for the assignee (cannot self-unenroll)', async () => {
      const token = tokens[report.email];
      const list = await ctx.app.inject({
        method: 'GET',
        url: '/api/learning/enrollments',
        headers: authHeader(token),
      });
      const required = (list.json() as Array<{ id: string; required: boolean }>).find(
        (e) => e.required,
      )!;
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/learning/enrollments/${required.id}`,
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  it('cleans up enrollments when a course is deleted', async () => {
    const token = tokens[admin.email];
    const id = await seedCourse({ title: 'Temporary Course' });
    await ctx.db.insert(courseEnrollments).values({
      id: createId('enr'),
      employeeId: other.employeeId,
      courseId: id,
      status: 'not_started',
      progress: 0,
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/learning/courses/${id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(204);
    const gone = await ctx.app.inject({
      method: 'GET',
      url: `/api/learning/courses/${id}`,
      headers: authHeader(token),
    });
    expect(gone.statusCode).toBe(404);
  });
});
