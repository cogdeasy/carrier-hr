import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createActionItemSchema,
  createGoalSchema,
  createOneOnOneSchema,
  createReviewCycleSchema,
  enrollReviewCycleSchema,
  goalQuerySchema,
  hasPermission,
  submitManagerReviewSchema,
  submitSelfReviewSchema,
  updateActionItemSchema,
  updateGoalSchema,
  updateOneOnOneSchema,
  updateReviewCycleSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import { Forbidden } from '../lib/errors.js';
import { listDirectReports } from '../services/employee.service.js';
import {
  addActionItem,
  createGoal,
  createOneOnOne,
  createReviewCycle,
  deleteActionItem,
  deleteGoal,
  deleteOneOnOne,
  enrollCycle,
  getOneOnOne,
  getReview,
  listCycles,
  listDirectReportRefs,
  listGoals,
  listOneOnOnes,
  listReviews,
  submitManagerReview,
  submitSelfReview,
  updateActionItem,
  updateGoal,
  updateOneOnOne,
  updateReviewCycle,
} from '../services/performance.service.js';

const idParam = z.object({ id: z.string() });

export async function performanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // --- Goals ---------------------------------------------------------------
  app.get('/goals', async (req) => {
    const q = parse(goalQuerySchema, req.query);
    const me = req.principal.employeeId;
    const isAdmin = hasPermission(req.principal.roles, 'performance:admin');
    const canReadTeam = hasPermission(req.principal.roles, 'performance:read:team');
    const filters = { cycleId: q.cycleId, status: q.status };

    if (q.scope === 'all') {
      if (!isAdmin) throw Forbidden('Missing required permission: performance:admin');
      return listGoals(app.db, null, filters);
    }
    if (q.scope === 'team' || (q.employeeId && q.employeeId !== me)) {
      if (!canReadTeam && !isAdmin) {
        throw Forbidden('You do not have access to these goals');
      }
      const reports = await listDirectReports(app.db, me);
      const reportIds = reports.map((r) => r.id);
      if (q.employeeId && q.employeeId !== me) {
        if (!isAdmin && !reportIds.includes(q.employeeId)) {
          throw Forbidden('You do not have access to these goals');
        }
        return listGoals(app.db, q.employeeId, filters);
      }
      return listGoals(app.db, reportIds, filters);
    }
    return listGoals(app.db, me, filters);
  });

  app.post('/goals', async (req, reply) => {
    const input = parse(createGoalSchema, req.body);
    const goal = await createGoal(app.db, req.principal.employeeId, input);
    return reply.status(201).send(goal);
  });

  app.patch('/goals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateGoalSchema, req.body);
    return updateGoal(app.db, req.principal.employeeId, id, input);
  });

  app.delete('/goals/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await deleteGoal(app.db, req.principal.employeeId, id);
    return reply.status(204).send();
  });

  // --- Review cycles -------------------------------------------------------
  app.get('/cycles', async () => listCycles(app.db));

  app.post(
    '/cycles',
    { onRequest: [app.requirePermission('performance:admin')] },
    async (req, reply) => {
      const input = parse(createReviewCycleSchema, req.body);
      const cycle = await createReviewCycle(app.db, input);
      return reply.status(201).send(cycle);
    },
  );

  app.patch(
    '/cycles/:id',
    { onRequest: [app.requirePermission('performance:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(updateReviewCycleSchema, req.body);
      return updateReviewCycle(app.db, id, input);
    },
  );

  app.post(
    '/cycles/:id/enroll',
    { onRequest: [app.requirePermission('performance:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(enrollReviewCycleSchema, req.body);
      return enrollCycle(app.db, id, input);
    },
  );

  // --- Reviews -------------------------------------------------------------
  app.get('/reviews', async (req) => {
    const { cycleId } = parse(z.object({ cycleId: z.string().optional() }), req.query);
    const mine = await listReviews(app.db, { employeeId: req.principal.employeeId, cycleId });
    const asReviewer = await listReviews(app.db, {
      reviewerId: req.principal.employeeId,
      cycleId,
    });
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
      const { cycleId } = parse(z.object({ cycleId: z.string().optional() }), req.query);
      if (hasPermission(req.principal.roles, 'performance:admin')) {
        return listReviews(app.db, { cycleId });
      }
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      return listReviews(app.db, { scopeEmployeeIds: reports.map((r) => r.id), cycleId });
    },
  );

  app.get('/reviews/:id', async (req) => {
    const { id } = parse(idParam, req.params);
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
    const { id } = parse(idParam, req.params);
    const input = parse(submitSelfReviewSchema, req.body);
    return submitSelfReview(app.db, req.principal.employeeId, id, input);
  });

  app.post('/reviews/:id/manager', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(submitManagerReviewSchema, req.body);
    return submitManagerReview(app.db, req.principal.employeeId, id, input);
  });

  // --- 1:1 meetings --------------------------------------------------------
  function viewer(req: FastifyRequest) {
    return {
      employeeId: req.principal.employeeId,
      isAdmin: hasPermission(req.principal.roles, 'performance:admin'),
    };
  }

  // Direct reports of the current user, used to populate goal scoping and the
  // 1:1 scheduling picker (managers lack the broader `employee:read` permission).
  app.get('/direct-reports', async (req) => listDirectReportRefs(app.db, req.principal.employeeId));

  app.get('/one-on-ones', async (req) => listOneOnOnes(app.db, req.principal.employeeId));

  app.get('/one-on-ones/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getOneOnOne(app.db, id, viewer(req));
  });

  app.post(
    '/one-on-ones',
    { onRequest: [app.requirePermission('performance:review')] },
    async (req, reply) => {
      const input = parse(createOneOnOneSchema, req.body);
      const meeting = await createOneOnOne(app.db, req.principal.employeeId, input);
      return reply.status(201).send(meeting);
    },
  );

  app.patch('/one-on-ones/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateOneOnOneSchema, req.body);
    return updateOneOnOne(app.db, viewer(req), id, input);
  });

  app.delete('/one-on-ones/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await deleteOneOnOne(app.db, viewer(req), id);
    return reply.status(204).send();
  });

  app.post('/one-on-ones/:id/action-items', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const input = parse(createActionItemSchema, req.body);
    const meeting = await addActionItem(app.db, viewer(req), id, input);
    return reply.status(201).send(meeting);
  });

  app.patch('/action-items/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateActionItemSchema, req.body);
    return updateActionItem(app.db, viewer(req), id, input);
  });

  app.delete('/action-items/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return deleteActionItem(app.db, viewer(req), id);
  });
}
