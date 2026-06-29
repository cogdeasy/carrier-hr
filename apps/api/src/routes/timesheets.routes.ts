import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decideTimesheetSchema, hasPermission, saveTimesheetSchema } from '@carrier-hr/shared';
import { eq } from 'drizzle-orm';
import { employees } from '../db/schema.js';
import { parse } from '../lib/validate.js';
import { listDirectReports } from '../services/employee.service.js';
import {
  decideTimesheet,
  getOrCreateWeek,
  listTimesheets,
  saveTimesheet,
  submitTimesheet,
} from '../services/timesheet.service.js';

export async function timesheetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => listTimesheets(app.db, { employeeId: req.principal.employeeId }));

  app.get('/week/:weekStarting', async (req) => {
    const { weekStarting } = parse(
      z.object({ weekStarting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }),
      req.params,
    );
    return getOrCreateWeek(app.db, req.principal.employeeId, weekStarting);
  });

  app.put('/', async (req) => {
    const input = parse(saveTimesheetSchema, req.body);
    return saveTimesheet(app.db, req.principal.employeeId, input);
  });

  app.post('/:id/submit', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const [me] = await app.db
      .select({ managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, req.principal.employeeId))
      .limit(1);
    return submitTimesheet(app.db, req.principal.employeeId, id, me?.managerId ?? null);
  });

  app.get(
    '/approvals',
    { onRequest: [app.requirePermission('timesheet:approve')] },
    async (req) => {
      const isAdmin = hasPermission(req.principal.roles, 'payroll:admin');
      if (isAdmin) return listTimesheets(app.db, { status: 'submitted' });
      const reports = await listDirectReports(app.db, req.principal.employeeId);
      return listTimesheets(app.db, {
        status: 'submitted',
        scopeEmployeeIds: reports.map((r) => r.id),
      });
    },
  );

  app.post(
    '/:id/decision',
    { onRequest: [app.requirePermission('timesheet:approve')] },
    async (req) => {
      const { id } = parse(z.object({ id: z.string() }), req.params);
      const input = parse(decideTimesheetSchema, req.body);
      const isAdmin = hasPermission(req.principal.roles, 'payroll:admin');
      return decideTimesheet(app.db, req.principal.employeeId, id, input, { isAdmin });
    },
  );
}
