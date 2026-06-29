import type { FastifyInstance } from 'fastify';
import { updateEmployeeSchema } from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import { getEmployeeDashboard } from '../services/analytics.service.js';
import { getEmployee, updateEmployee } from '../services/employee.service.js';

/** Self-service endpoints scoped to the authenticated employee. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => getEmployee(app.db, req.principal.employeeId));

  app.patch('/', async (req) => {
    // Self-service updates are limited to contact details.
    const full = parse(updateEmployeeSchema, req.body);
    const allowed = {
      workPhone: full.workPhone,
      personalPhone: full.personalPhone,
      address: full.address,
      emergencyContact: full.emergencyContact,
    };
    return updateEmployee(app.db, req.principal.employeeId, allowed);
  });

  app.get('/dashboard', async (req) => getEmployeeDashboard(app.db, req.principal.employeeId));
}
