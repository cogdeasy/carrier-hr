import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assignCourseSchema,
  createCourseSchema,
  enrollCourseSchema,
  hasPermission,
  listCoursesQuerySchema,
  updateCourseSchema,
  updateEnrollmentSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import { listDirectReports } from '../services/employee.service.js';
import { createNotification } from '../services/notification.service.js';
import {
  assignCourse,
  complianceReport,
  createCourse,
  deleteCourse,
  enroll,
  getCourse,
  listCourses,
  listEnrollments,
  listTeamEnrollments,
  unenroll,
  updateCourse,
  updateProgress,
} from '../services/learning.service.js';

const idParam = z.object({ id: z.string() });

export async function learningRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/courses', async (req) => {
    const query = parse(listCoursesQuerySchema, req.query);
    return listCourses(app.db, query);
  });

  app.get('/courses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getCourse(app.db, id);
  });

  app.post(
    '/courses',
    { onRequest: [app.requirePermission('learning:admin')] },
    async (req, reply) => {
      const input = parse(createCourseSchema, req.body);
      const course = await createCourse(app.db, input);
      return reply.status(201).send(course);
    },
  );

  app.patch(
    '/courses/:id',
    { onRequest: [app.requirePermission('learning:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(updateCourseSchema, req.body);
      return updateCourse(app.db, id, input);
    },
  );

  app.delete(
    '/courses/:id',
    { onRequest: [app.requirePermission('learning:admin')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      await deleteCourse(app.db, id);
      return reply.status(204).send();
    },
  );

  app.get('/enrollments', async (req) => listEnrollments(app.db, req.principal.employeeId));

  app.post('/enrollments', async (req, reply) => {
    const input = parse(enrollCourseSchema, req.body);
    const enrollment = await enroll(app.db, req.principal.employeeId, input.courseId);
    return reply.status(201).send(enrollment);
  });

  app.patch('/enrollments/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateEnrollmentSchema, req.body);
    return updateProgress(app.db, req.principal.employeeId, id, input.progress);
  });

  app.delete('/enrollments/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await unenroll(app.db, req.principal.employeeId, id);
    return reply.status(204).send();
  });

  app.post(
    '/assignments',
    { onRequest: [app.requirePermission('learning:assign')] },
    async (req, reply) => {
      const input = parse(assignCourseSchema, req.body);
      if (!hasPermission(req.principal.roles, 'learning:admin')) {
        const reports = await listDirectReports(app.db, req.principal.employeeId);
        const allowed = new Set(reports.map((r) => r.id));
        const outside = input.employeeIds.filter((id) => !allowed.has(id));
        if (outside.length) {
          return reply
            .status(403)
            .send({ error: { code: 'forbidden', message: 'You can only assign to your direct reports' } });
        }
      }
      const course = await getCourse(app.db, input.courseId);
      const result = await assignCourse(app.db, req.principal.employeeId, input);
      for (const e of result.enrollments) {
        await createNotification(app.db, {
          employeeId: e.employeeId,
          type: 'learning_assigned',
          title: 'Required training assigned',
          body: `${course.title} has been assigned to you${e.dueDate ? ` (due ${e.dueDate})` : ''}.`,
          link: '/learning',
        });
      }
      return reply.status(201).send(result);
    },
  );

  app.get(
    '/team',
    { onRequest: [app.requirePermission('learning:read:team')] },
    async (req) => {
      if (hasPermission(req.principal.roles, 'learning:admin')) {
        return listTeamEnrollments(app.db);
      }
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      return listTeamEnrollments(app.db, { employeeIds: reports.map((r) => r.id) });
    },
  );

  app.get(
    '/compliance',
    { onRequest: [app.requirePermission('learning:read:team')] },
    async (req) => {
      if (hasPermission(req.principal.roles, 'learning:admin')) {
        return complianceReport(app.db);
      }
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      return complianceReport(app.db, { employeeIds: reports.map((r) => r.id) });
    },
  );
}
