import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTimeOffSchema, decideTimeOffSchema, hasPermission } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { listDirectReports } from '../services/employee.service.js';
import {
  cancelRequest,
  createRequest,
  decideRequest,
  getBalances,
  listHolidays,
  listRequests,
} from '../services/timeoff.service.js';

export async function timeOffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/balances', async (req) => getBalances(app.db, req.principal.employeeId));

  app.get('/holidays', async (req) => {
    const { region } = parse(z.object({ region: z.string().optional() }), req.query);
    return listHolidays(app.db, region);
  });

  app.get('/requests', async (req) =>
    listRequests(app.db, { employeeId: req.principal.employeeId }),
  );

  app.post('/requests', async (req, reply) => {
    const input = parse(createTimeOffSchema, req.body);
    const created = await createRequest(app.db, req.principal.employeeId, input);
    return reply.status(201).send(created);
  });

  app.post('/requests/:id/cancel', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return cancelRequest(app.db, req.principal.employeeId, id);
  });

  // Manager / HR approval queue.
  app.get('/approvals', { onRequest: [app.requirePermission('timeoff:approve')] }, async (req) => {
    const isAdmin = hasPermission(req.principal.roles, 'timeoff:admin');
    if (isAdmin) {
      return listRequests(app.db, { status: 'pending' });
    }
    const reports = await listDirectReports(app.db, req.principal.employeeId);
    return listRequests(app.db, {
      status: 'pending',
      scopeEmployeeIds: reports.map((r) => r.id),
    });
  });

  app.post(
    '/requests/:id/decision',
    { onRequest: [app.requirePermission('timeoff:approve')] },
    async (req) => {
      const { id } = parse(z.object({ id: z.string() }), req.params);
      const input = parse(decideTimeOffSchema, req.body);
      const isAdmin = hasPermission(req.principal.roles, 'timeoff:admin');
      return decideRequest(app.db, req.principal.employeeId, id, input, { isAdmin });
    },
  );
}
