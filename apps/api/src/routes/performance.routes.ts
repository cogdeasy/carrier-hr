import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createGoalSchema,
  hasPermission,
  submitManagerReviewSchema,
  submitSelfReviewSchema,
  updateGoalSchema,
} from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { Forbidden } from '../lib/errors.js';
import { listDirectReports } from '../services/employee.service.js';
import {
  createGoal,
  deleteGoal,
  getReview,
  listCycles,
  listGoals,
  listReviews,
  submitManagerReview,
  submitSelfReview,
  updateGoal,
} from '../services/performance.service.js';

export async function performanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/goals', async (req) => listGoals(app.db, req.principal.employeeId));

  app.post('/goals', async (req, reply) => {
    const input = parse(createGoalSchema, req.body);
    const goal = await createGoal(app.db, req.principal.employeeId, input);
    return reply.status(201).send(goal);
  });

  app.patch('/goals/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateGoalSchema, req.body);
    return updateGoal(app.db, req.principal.employeeId, id, input);
  });

  app.delete('/goals/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    await deleteGoal(app.db, req.principal.employeeId, id);
    return reply.status(204).send();
  });

  app.get('/cycles', async () => listCycles(app.db));

  app.get('/reviews', async (req) => {
    // Reviews where I'm the subject, plus reviews I conduct as reviewer.
    const mine = await listReviews(app.db, { employeeId: req.principal.employeeId });
    const asReviewer = await listReviews(app.db, { reviewerId: req.principal.employeeId });
    const seen = new Set<string>();
    return [...mine, ...asReviewer].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });

  app.get(
    '/reviews/team',
    { onRequest: [app.requirePermission('performance:read:team')] },
    async (req) => {
      if (hasPermission(req.principal.roles, 'performance:admin')) {
        return listReviews(app.db, {});
      }
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      return listReviews(app.db, { scopeEmployeeIds: reports.map((r) => r.id) });
    },
  );

  app.get('/reviews/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const review = await getReview(app.db, id);
    const isSubject = review.employeeId === req.principal.employeeId;
    const isReviewer = review.reviewerId === req.principal.employeeId;
    const isAdmin = hasPermission(req.principal.roles, 'performance:admin');
    let isManagerOfSubject = false;
    if (!isSubject && !isReviewer && !isAdmin) {
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      isManagerOfSubject = reports.some((r) => r.id === review.employeeId);
    }
    if (!isSubject && !isReviewer && !isAdmin && !isManagerOfSubject) {
      throw Forbidden('You do not have access to this review');
    }
    return review;
  });

  app.post('/reviews/:id/self', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(submitSelfReviewSchema, req.body);
    return submitSelfReview(app.db, req.principal.employeeId, id, input);
  });

  app.post('/reviews/:id/manager', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(submitManagerReviewSchema, req.body);
    return submitManagerReview(app.db, req.principal.employeeId, id, input);
  });
}
