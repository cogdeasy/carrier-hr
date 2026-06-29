import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyticsExportQuerySchema, analyticsFiltersSchema, hasPermission } from '@collins-hr/shared';
import { Forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import {
  dashboardDatasetToCsv,
  getEmployeeDashboard,
  getHrDashboard,
  getTeamDashboard,
} from '../services/analytics.service.js';

const teamQuerySchema = z.object({ managerId: z.string().trim().min(1).optional() });

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // Org-wide workforce analytics. HR/executive/admin only.
  app.get('/hr', { onRequest: [app.requirePermission('analytics:read')] }, async (req) => {
    const filters = parse(analyticsFiltersSchema, req.query);
    return getHrDashboard(app.db, filters);
  });

  // CSV export of a single dashboard dataset, honouring the same filters.
  app.get(
    '/hr/export',
    { onRequest: [app.requirePermission('analytics:read')] },
    async (req, reply) => {
      const { dataset, ...filters } = parse(analyticsExportQuerySchema, req.query);
      const dashboard = await getHrDashboard(app.db, filters);
      const csv = dashboardDatasetToCsv(dataset, dashboard);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${dataset}.csv"`)
        .send(csv);
    },
  );

  // Team analytics. Managers (`analytics:read:team`) see their own team;
  // org-wide readers (`analytics:read`, e.g. HR/executive) may also reach this
  // route and inspect any manager's team via `?managerId=`.
  app.get(
    '/team',
    {
      onRequest: async (req) => {
        if (
          !hasPermission(req.principal.roles, 'analytics:read:team') &&
          !hasPermission(req.principal.roles, 'analytics:read')
        ) {
          throw Forbidden('Missing required permission: analytics:read:team');
        }
      },
    },
    async (req) => {
      const { managerId } = parse(teamQuerySchema, req.query);
      const isOrgWide = hasPermission(req.principal.roles, 'analytics:read');
      if (managerId && managerId !== req.principal.employeeId && !isOrgWide) {
        throw Forbidden('You can only view your own team analytics');
      }
      return getTeamDashboard(app.db, managerId ?? req.principal.employeeId);
    },
  );

  // Personal summary for the authenticated employee.
  app.get('/me', async (req) => getEmployeeDashboard(app.db, req.principal.employeeId));
}
