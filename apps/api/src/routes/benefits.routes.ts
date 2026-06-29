import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDependentSchema,
  createLifeEventSchema,
  decideLifeEventSchema,
  enrollBenefitSchema,
  listEnrollmentsQuerySchema,
  updateDependentSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  adminListEnrollments,
  createDependent,
  createLifeEvent,
  decideLifeEvent,
  deleteDependent,
  enroll,
  getCostSummary,
  getEligibility,
  listDependents,
  listEnrollments,
  listLifeEvents,
  listPeriods,
  listPlans,
  updateDependent,
} from '../services/benefits.service.js';

const idParam = z.object({ id: z.string() });

export async function benefitsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/plans', async (req) => {
    const { planYear } = parse(z.object({ planYear: z.coerce.number().optional() }), req.query);
    return listPlans(app.db, planYear);
  });

  app.get('/enrollment-periods', async () => listPeriods(app.db));

  app.get(
    '/eligibility',
    { onRequest: [app.requirePermission('benefits:read:own')] },
    async (req) => getEligibility(app.db, req.principal.employeeId),
  );

  app.get(
    '/enrollments',
    { onRequest: [app.requirePermission('benefits:read:own')] },
    async (req) => listEnrollments(app.db, req.principal.employeeId),
  );

  app.get(
    '/summary',
    { onRequest: [app.requirePermission('benefits:read:own')] },
    async (req) => getCostSummary(app.db, req.principal.employeeId),
  );

  // Benefits enrollment is self-service: the target employee is always the
  // authenticated principal (never a value from the request body), so a user
  // can only ever create or change their own enrollment.
  app.post(
    '/enrollments',
    { onRequest: [app.requirePermission('benefits:enroll')] },
    async (req) => {
      const input = parse(enrollBenefitSchema, req.body);
      return enroll(app.db, req.principal.employeeId, input);
    },
  );

  // -------------------------------------------------------------------------
  // Dependents (self-service)
  // -------------------------------------------------------------------------

  app.get(
    '/dependents',
    { onRequest: [app.requirePermission('benefits:read:own')] },
    async (req) => listDependents(app.db, req.principal.employeeId),
  );

  app.post(
    '/dependents',
    { onRequest: [app.requirePermission('benefits:enroll')] },
    async (req, reply) => {
      const input = parse(createDependentSchema, req.body);
      const dependent = await createDependent(app.db, req.principal.employeeId, input);
      return reply.status(201).send(dependent);
    },
  );

  app.patch(
    '/dependents/:id',
    { onRequest: [app.requirePermission('benefits:enroll')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(updateDependentSchema, req.body);
      return updateDependent(app.db, req.principal.employeeId, id, input);
    },
  );

  app.delete(
    '/dependents/:id',
    { onRequest: [app.requirePermission('benefits:enroll')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      await deleteDependent(app.db, req.principal.employeeId, id);
      return reply.status(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // Qualifying life events
  // -------------------------------------------------------------------------

  app.get(
    '/life-events',
    { onRequest: [app.requirePermission('benefits:read:own')] },
    async (req) => listLifeEvents(app.db, { employeeId: req.principal.employeeId }),
  );

  app.post(
    '/life-events',
    { onRequest: [app.requirePermission('benefits:enroll')] },
    async (req, reply) => {
      const input = parse(createLifeEventSchema, req.body);
      const event = await createLifeEvent(app.db, req.principal.employeeId, input);
      return reply.status(201).send(event);
    },
  );

  // -------------------------------------------------------------------------
  // HR administration
  // -------------------------------------------------------------------------

  app.get(
    '/admin/enrollments',
    { onRequest: [app.requirePermission('benefits:admin')] },
    async (req) => {
      const query = parse(listEnrollmentsQuerySchema, req.query);
      return adminListEnrollments(app.db, query);
    },
  );

  app.get(
    '/admin/life-events',
    { onRequest: [app.requirePermission('benefits:admin')] },
    async () => listLifeEvents(app.db, {}),
  );

  app.patch(
    '/admin/life-events/:id',
    { onRequest: [app.requirePermission('benefits:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(decideLifeEventSchema, req.body);
      return decideLifeEvent(app.db, req.principal.employeeId, id, input);
    },
  );
}
