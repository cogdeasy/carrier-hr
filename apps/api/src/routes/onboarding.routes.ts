import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasPermission, updateOnboardingTaskSchema } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { getPlan, updateTask } from '../services/onboarding.service.js';

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/plan', async (req) => getPlan(app.db, req.principal.employeeId));

  app.get(
    '/employees/:employeeId/plan',
    { onRequest: [app.requirePermission('onboarding:read')] },
    async (req) => {
      const { employeeId } = parse(z.object({ employeeId: z.string() }), req.params);
      return getPlan(app.db, employeeId);
    },
  );

  app.patch('/tasks/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateOnboardingTaskSchema, req.body);
    const canManage = hasPermission(req.principal.roles, 'onboarding:admin');
    return updateTask(app.db, id, input.status, {
      employeeId: req.principal.employeeId,
      canManage,
    });
  });
}
