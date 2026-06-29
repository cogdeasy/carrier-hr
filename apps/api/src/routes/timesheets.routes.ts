import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  attendanceSummaryQuerySchema,
  bulkDecideTimesheetSchema,
  decideTimesheetSchema,
  hasPermission,
  saveTimesheetSchema,
  timesheetListQuerySchema,
} from '@collins-hr/shared';
import { eq } from 'drizzle-orm';
import { employees } from '../db/schema.js';
import { Forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { listDirectReports } from '../services/employee.service.js';
import {
  bulkApproveTimesheets,
  decideTimesheet,
  getAttendanceSummary,
  getOrCreateWeek,
  listTimesheets,
  listTimesheetsPaginated,
  saveTimesheet,
  submitTimesheet,
} from '../services/timesheet.service.js';

async function managerScope(app: FastifyInstance, employeeId: string): Promise<string[]> {
  const reports = await listDirectReports(app.db, employeeId);
  return reports.map((r) => r.id);
}

export async function timesheetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    const query = parse(timesheetListQuerySchema, req.query);
    return listTimesheetsPaginated(app.db, req.principal.employeeId, query);
  });

  app.get('/summary', async (req) => {
    const query = parse(attendanceSummaryQuerySchema, req.query);
    let employeeId = req.principal.employeeId;
    if (query.employeeId && query.employeeId !== req.principal.employeeId) {
      const isAdmin = hasPermission(req.principal.roles, 'payroll:admin');
      const canTeam = hasPermission(req.principal.roles, 'timesheet:read:team');
      if (!isAdmin && !canTeam) throw Forbidden('Cannot view another employee summary');
      if (!isAdmin) {
        const reports = await managerScope(app, req.principal.employeeId);
        if (!reports.includes(query.employeeId)) {
          throw Forbidden('Employee is not in your team');
        }
      }
      employeeId = query.employeeId;
    }
    return getAttendanceSummary(app.db, employeeId, { from: query.from, to: query.to });
  });

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
      const scope = await managerScope(app, req.principal.employeeId);
      return listTimesheets(app.db, { status: 'submitted', scopeEmployeeIds: scope });
    },
  );

  app.post(
    '/:id/decision',
    { onRequest: [app.requirePermission('timesheet:approve')] },
    async (req) => {
      const { id } = parse(z.object({ id: z.string() }), req.params);
      const input = parse(decideTimesheetSchema, req.body);
      const isAdmin = hasPermission(req.principal.roles, 'payroll:admin');
      const scopeEmployeeIds = isAdmin ? undefined : await managerScope(app, req.principal.employeeId);
      return decideTimesheet(app.db, req.principal.employeeId, id, input, { isAdmin, scopeEmployeeIds });
    },
  );

  app.post(
    '/approvals/bulk',
    { onRequest: [app.requirePermission('timesheet:approve')] },
    async (req) => {
      const input = parse(bulkDecideTimesheetSchema, req.body);
      const isAdmin = hasPermission(req.principal.roles, 'payroll:admin');
      const scopeEmployeeIds = isAdmin ? undefined : await managerScope(app, req.principal.employeeId);
      return bulkApproveTimesheets(app.db, req.principal.employeeId, input, { isAdmin, scopeEmployeeIds });
    },
  );
}
