import type { FastifyInstance } from 'fastify';
import { getHrDashboard } from '../services/analytics.service.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/hr', { onRequest: [app.requirePermission('analytics:read')] }, async () =>
    getHrDashboard(app.db),
  );
}
