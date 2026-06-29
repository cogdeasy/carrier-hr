import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTimeOffSchema, decideTimeOffSchema, hasPermission } from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
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

  // Manager / HR approval queue. Non-admins see exactly the requests they are
  // the assigned approver for, which keeps the queue consistent with the
  // authorization check in decideRequest (both key off approverId) — scoping by
  // current direct reports could otherwise hide a request whose approver was set
  // at submission time.
  app.get('/approvals', { onRequest: [app.requirePermission('timeoff:approve')] }, async (req) => {
    const isAdmin = hasPermission(req.principal.roles, 'timeoff:admin');
    if (isAdmin) {
      return listRequests(app.db, { status: 'pending' });
    }
    return listRequests(app.db, {
      status: 'pending',
      approverId: req.principal.employeeId,
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
