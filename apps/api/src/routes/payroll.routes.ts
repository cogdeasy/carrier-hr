import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasPermission } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { getCompensation, getPayslip, listPayslips } from '../services/payroll.service.js';

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/payslips', async (req) => listPayslips(app.db, req.principal.employeeId));

  app.get('/compensation', async (req) => getCompensation(app.db, req.principal.employeeId));

  app.get('/payslips/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const allowAny = hasPermission(req.principal.roles, 'payroll:read');
    return getPayslip(app.db, req.principal.employeeId, id, { allowAny });
  });

  // HR view of any employee's payslips.
  app.get(
    '/employees/:employeeId/payslips',
    { onRequest: [app.requirePermission('payroll:read')] },
    async (req) => {
      const { employeeId } = parse(z.object({ employeeId: z.string() }), req.params);
      return listPayslips(app.db, employeeId);
    },
  );
}
