import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCompanyHolidaySchema,
  createTimeOffSchema,
  decideTimeOffSchema,
  hasPermission,
  listTimeOffQuerySchema,
  teamCalendarQuerySchema,
  updateCompanyHolidaySchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  calendarScope,
  cancelRequest,
  createHoliday,
  createRequest,
  decideRequest,
  deleteHoliday,
  getBalances,
  getPolicies,
  getTeamCalendar,
  listHolidays,
  listRequests,
  listRequestsPaginated,
  runCarryover,
  updateHoliday,
} from '../services/timeoff.service.js';

export async function timeOffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/balances', async (req) => {
    const { year } = parse(z.object({ year: z.coerce.number().int().optional() }), req.query);
    return getBalances(app.db, req.principal.employeeId, year);
  });

  app.get('/policies', async () => getPolicies(app.db));

  app.get('/holidays', async (req) => {
    const { region } = parse(z.object({ region: z.string().optional() }), req.query);
    return listHolidays(app.db, region);
  });

  app.get('/requests', async (req) => {
    const query = parse(listTimeOffQuerySchema, req.query);
    return listRequestsPaginated(app.db, { employeeId: req.principal.employeeId }, query);
  });

  app.post('/requests', async (req, reply) => {
    const input = parse(createTimeOffSchema, req.body);
    const created = await createRequest(app.db, req.principal.employeeId, input);
    return reply.status(201).send(created);
  });

  app.post('/requests/:id/cancel', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return cancelRequest(app.db, req.principal.employeeId, id);
  });

  // Team calendar of who is off, scoped by the viewer's role.
  app.get('/calendar', async (req) => {
    const { from, to } = parse(teamCalendarQuerySchema, req.query);
    const scope = await calendarScope(app.db, req.principal.employeeId, req.principal.roles);
    return getTeamCalendar(app.db, scope, from, to);
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

  // Company holidays management (HR/admin only).
  app.post('/holidays', { onRequest: [app.requirePermission('timeoff:admin')] }, async (req, reply) => {
    const input = parse(createCompanyHolidaySchema, req.body);
    const created = await createHoliday(app.db, input);
    return reply.status(201).send(created);
  });

  app.patch('/holidays/:id', { onRequest: [app.requirePermission('timeoff:admin')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateCompanyHolidaySchema, req.body);
    return updateHoliday(app.db, id, input);
  });

  app.delete('/holidays/:id', { onRequest: [app.requirePermission('timeoff:admin')] }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    await deleteHoliday(app.db, id);
    return reply.status(204).send();
  });

  // Year-end carryover roll-forward (HR/admin only).
  app.post('/carryover', { onRequest: [app.requirePermission('timeoff:admin')] }, async (req) => {
    const { fromYear } = parse(
      z.object({ fromYear: z.coerce.number().int().min(2000).max(2100) }),
      req.body,
    );
    return runCarryover(app.db, fromYear);
  });
}
