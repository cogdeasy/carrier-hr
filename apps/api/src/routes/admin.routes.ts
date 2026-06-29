import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminUserQuerySchema,
  assignRolesSchema,
  auditLogQuerySchema,
  setUserStatusSchema,
  updateOrgSettingsSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  assignRoles,
  auditFacets,
  getOrgSettings,
  listAdminUsers,
  listAuditLogs,
  listHolidays,
  resetPassword,
  setUserStatus,
  updateOrgSettings,
} from '../services/admin.service.js';

const idParam = z.object({ id: z.string().min(1) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // --- Organization settings -------------------------------------------------
  app.get('/settings', { onRequest: [app.requirePermission('settings:admin')] }, async () => {
    return getOrgSettings(app.db);
  });

  app.put('/settings', { onRequest: [app.requirePermission('settings:admin')] }, async (req) => {
    const input = parse(updateOrgSettingsSchema, req.body);
    return updateOrgSettings(app.db, req.principal.employeeId, input);
  });

  app.get('/holidays', { onRequest: [app.requirePermission('settings:admin')] }, async () => {
    return listHolidays(app.db);
  });

  // --- User & role management ------------------------------------------------
  app.get('/users', { onRequest: [app.requirePermission('settings:admin')] }, async (req) => {
    const q = parse(adminUserQuerySchema, req.query);
    return listAdminUsers(app.db, q);
  });

  app.put(
    '/users/:id/roles',
    { onRequest: [app.requirePermission('settings:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const { roles } = parse(assignRolesSchema, req.body);
      return assignRoles(app.db, req.principal.employeeId, id, roles);
    },
  );

  app.post(
    '/users/:id/status',
    { onRequest: [app.requirePermission('settings:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const { status, reason } = parse(setUserStatusSchema, req.body);
      return setUserStatus(app.db, req.principal.employeeId, id, status, reason);
    },
  );

  app.post(
    '/users/:id/reset-password',
    { onRequest: [app.requirePermission('settings:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      return resetPassword(app.db, req.principal.employeeId, id);
    },
  );

  // --- Audit log -------------------------------------------------------------
  app.get('/audit', { onRequest: [app.requirePermission('audit:read')] }, async (req) => {
    const q = parse(auditLogQuerySchema, req.query);
    return listAuditLogs(app.db, q);
  });

  app.get('/audit/facets', { onRequest: [app.requirePermission('audit:read')] }, async () => {
    return auditFacets(app.db);
  });
}
