import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminPayslipQuerySchema,
  createPayslipSchema,
  generatePayRunSchema,
  hasPermission,
  payRunQuerySchema,
  payslipQuerySchema,
  ytdQuerySchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  createPayslip,
  deletePayslip,
  generatePayRun,
  getCompensation,
  getPayRun,
  getPayslip,
  getYtdSummary,
  listAllPayslips,
  listPayRuns,
  listPayslips,
  markPayRunPaid,
  markPayslipPaid,
} from '../services/payroll.service.js';

const idParams = z.object({ id: z.string().min(1) });

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/payslips', async (req) => {
    const query = parse(payslipQuerySchema, req.query);
    return listPayslips(app.db, req.principal.employeeId, query);
  });

  app.get('/compensation', async (req) => getCompensation(app.db, req.principal.employeeId));

  app.get('/ytd', async (req) => {
    const { year } = parse(ytdQuerySchema, req.query);
    return getYtdSummary(app.db, req.principal.employeeId, year ?? new Date().getUTCFullYear());
  });

  // Admin: list payslips across employees (hydrated with employee refs).
  app.get('/admin/payslips', { onRequest: [app.requirePermission('payroll:read')] }, async (req) => {
    const query = parse(adminPayslipQuerySchema, req.query);
    return listAllPayslips(app.db, query);
  });

  // Admin: create a one-off payslip outside a scheduled pay run.
  app.post(
    '/admin/payslips',
    { onRequest: [app.requirePermission('payroll:admin')] },
    async (req, reply) => {
      const input = parse(createPayslipSchema, req.body);
      const created = await createPayslip(app.db, input);
      return reply.status(201).send(created);
    },
  );

  app.get('/payslips/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    const allowAny = hasPermission(req.principal.roles, 'payroll:read');
    return getPayslip(app.db, req.principal.employeeId, id, { allowAny });
  });

  app.post(
    '/payslips/:id/pay',
    { onRequest: [app.requirePermission('payroll:admin')] },
    async (req) => {
      const { id } = parse(idParams, req.params);
      return markPayslipPaid(app.db, id);
    },
  );

  app.delete(
    '/payslips/:id',
    { onRequest: [app.requirePermission('payroll:admin')] },
    async (req, reply) => {
      const { id } = parse(idParams, req.params);
      await deletePayslip(app.db, id);
      return reply.status(204).send();
    },
  );

  // HR view of a specific employee's payslips.
  app.get(
    '/employees/:employeeId/payslips',
    { onRequest: [app.requirePermission('payroll:read')] },
    async (req) => {
      const { employeeId } = parse(z.object({ employeeId: z.string().min(1) }), req.params);
      const query = parse(payslipQuerySchema, req.query);
      return listPayslips(app.db, employeeId, query);
    },
  );

  app.post('/pay-runs', { onRequest: [app.requirePermission('payroll:admin')] }, async (req, reply) => {
    const input = parse(generatePayRunSchema, req.body);
    const created = await generatePayRun(app.db, req.principal.employeeId, input);
    return reply.status(201).send(created);
  });

  app.get('/pay-runs', { onRequest: [app.requirePermission('payroll:read')] }, async (req) => {
    const query = parse(payRunQuerySchema, req.query);
    return listPayRuns(app.db, query);
  });

  app.get('/pay-runs/:id', { onRequest: [app.requirePermission('payroll:read')] }, async (req) => {
    const { id } = parse(idParams, req.params);
    return getPayRun(app.db, id);
  });

  app.post(
    '/pay-runs/:id/pay',
    { onRequest: [app.requirePermission('payroll:admin')] },
    async (req) => {
      const { id } = parse(idParams, req.params);
      return markPayRunPaid(app.db, id);
    },
  );
}
