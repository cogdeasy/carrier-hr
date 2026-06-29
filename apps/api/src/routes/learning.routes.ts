import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enrollCourseSchema, updateEnrollmentSchema } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import {
  enroll,
  listCourses,
  listEnrollments,
  updateProgress,
} from '../services/learning.service.js';

export async function learningRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/courses', async (req) => {
    const { category } = parse(z.object({ category: z.string().optional() }), req.query);
    return listCourses(app.db, category);
  });

  app.get('/enrollments', async (req) => listEnrollments(app.db, req.principal.employeeId));

  app.post('/enrollments', async (req, reply) => {
    const input = parse(enrollCourseSchema, req.body);
    const enrollment = await enroll(app.db, req.principal.employeeId, input.courseId);
    return reply.status(201).send(enrollment);
  });

  app.patch('/enrollments/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateEnrollmentSchema, req.body);
    return updateProgress(app.db, req.principal.employeeId, id, input.progress);
  });
}
