import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enrollBenefitSchema } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { enroll, listEnrollments, listPlans } from '../services/benefits.service.js';

export async function benefitsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/plans', async (req) => {
    const { planYear } = parse(z.object({ planYear: z.coerce.number().optional() }), req.query);
    return listPlans(app.db, planYear);
  });

  app.get('/enrollments', async (req) => listEnrollments(app.db, req.principal.employeeId));

  // Benefits enrollment is self-service: the target employee is always the
  // authenticated principal (never a value from the request body), so a user
  // can only ever create or change their own enrollment.
  app.post('/enrollments', async (req) => {
    const input = parse(enrollBenefitSchema, req.body);
    return enroll(app.db, req.principal.employeeId, input);
  });
}
