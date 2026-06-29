import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  ROLES,
  terminateEmployeeSchema,
  updateEmployeeSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  createEmployee,
  getEmployeeForViewer,
  getOrgChart,
  listDirectReports,
  listEmployees,
  reactivateEmployee,
  setEmployeeRoles,
  terminateEmployee,
  updateEmployee,
  type Viewer,
} from '../services/employee.service.js';

function viewerOf(req: { principal: { employeeId: string; roles: Viewer['roles'] } }): Viewer {
  return { employeeId: req.principal.employeeId, roles: req.principal.roles };
}

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', { onRequest: [app.requirePermission('employee:read')] }, async (req) => {
    const q = parse(listEmployeesQuerySchema, req.query);
    return listEmployees(app.db, q, viewerOf(req));
  });

  app.get('/org-chart', { onRequest: [app.requirePermission('org:read')] }, async (req) => {
    const { rootId } = parse(z.object({ rootId: z.string().optional() }), req.query);
    return getOrgChart(app.db, rootId);
  });

  app.get('/:id', { onRequest: [app.requirePermission('employee:read')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return getEmployeeForViewer(app.db, id, viewerOf(req));
  });

  app.get('/:id/reports', { onRequest: [app.requirePermission('employee:read')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return listDirectReports(app.db, id, viewerOf(req));
  });

  app.post('/', { onRequest: [app.requirePermission('employee:write')] }, async (req, reply) => {
    const input = parse(createEmployeeSchema, req.body);
    const { employee, temporaryPassword } = await createEmployee(app.db, input);
    // The one-time temporary password is surfaced once so the admin can relay it
    // to the new hire; it is never stored in plaintext or returned again.
    return reply.status(201).send({ ...employee, temporaryPassword });
  });

  app.patch('/:id', { onRequest: [app.requirePermission('employee:write')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateEmployeeSchema, req.body);
    return updateEmployee(app.db, id, input);
  });

  app.post('/:id/terminate', { onRequest: [app.requirePermission('employee:write')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(terminateEmployeeSchema, req.body);
    return terminateEmployee(app.db, id, input);
  });

  app.post('/:id/reactivate', { onRequest: [app.requirePermission('employee:write')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return reactivateEmployee(app.db, id);
  });

  app.put('/:id/roles', { onRequest: [app.requirePermission('settings:admin')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const { roles } = parse(z.object({ roles: z.array(z.enum(ROLES)).min(1) }), req.body);
    await setEmployeeRoles(app.db, id, roles);
    return getEmployeeForViewer(app.db, id, viewerOf(req));
  });
}
