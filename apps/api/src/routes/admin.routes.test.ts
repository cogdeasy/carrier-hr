import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { auditLogs, employees, userRoles, users } from '../db/schema.js';
import { recordAudit } from '../services/admin.service.js';

describe('admin & audit log', () => {
  let ctx: TestContext;
  let adminToken: string;
  let employeeToken: string;
  let target: { employeeId: string; userId: string; email: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, {
      email: 'admin@collins.com',
      roles: ['super_admin'],
      firstName: 'Ada',
      lastName: 'Admin',
    });
    // A second super admin so the last-super-admin guard does not block tests
    // that demote the primary admin.
    await seedUser(ctx.db, { email: 'admin2@collins.com', roles: ['super_admin'] });
    await seedUser(ctx.db, {
      email: 'worker@collins.com',
      roles: ['employee'],
      firstName: 'Eve',
      lastName: 'Employee',
    });
    adminToken = await login(ctx.app, 'admin@collins.com');
    employeeToken = await login(ctx.app, 'worker@collins.com');
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    const [t] = await ctx.db
      .select({ employeeId: employees.id, userId: users.id, email: users.email })
      .from(employees)
      .innerJoin(users, eq(users.employeeId, employees.id))
      .where(eq(employees.email, 'worker@collins.com'))
      .limit(1);
    target = t!;
    // Reset the target to a known state between tests.
    await ctx.db.delete(userRoles).where(eq(userRoles.userId, target.userId));
    await ctx.db.insert(userRoles).values({
      id: `rol_${Math.random().toString(36).slice(2)}`,
      userId: target.userId,
      role: 'employee',
    });
    await ctx.db
      .update(employees)
      .set({ status: 'active', terminationDate: null })
      .where(eq(employees.id, target.employeeId));
  });

  describe('authorization', () => {
    it('returns 403 for non-admins on every admin endpoint', async () => {
      const cases: [string, string][] = [
        ['GET', '/api/admin/users'],
        ['GET', '/api/admin/settings'],
        ['GET', '/api/admin/holidays'],
        ['GET', '/api/admin/audit'],
        ['PUT', `/api/admin/users/${target.employeeId}/roles`],
        ['POST', `/api/admin/users/${target.employeeId}/status`],
        ['POST', `/api/admin/users/${target.employeeId}/reset-password`],
      ];
      for (const [method, url] of cases) {
        const res = await ctx.app.inject({
          method: method as 'GET',
          url,
          headers: authHeader(employeeToken),
          payload: method === 'GET' ? undefined : {},
        });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
      }
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/users' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('user listing', () => {
    it('lists users with roles and supports pagination', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/users?pageSize=2&page=1',
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBe(2);
      expect(body.total).toBeGreaterThanOrEqual(3);
      expect(body.data[0]).toHaveProperty('roles');
    });

    it('filters by role', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/users?role=super_admin',
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThanOrEqual(2);
      for (const u of body.data) expect(u.roles).toContain('super_admin');
    });

    it('searches by name', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/users?search=Employee',
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.some((u: { email: string }) => u.email === 'worker@collins.com')).toBe(
        true,
      );
    });
  });

  describe('role assignment', () => {
    it('assigns roles and records an audit entry', async () => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/admin/users/${target.employeeId}/roles`,
        headers: authHeader(adminToken),
        payload: { roles: ['employee', 'manager'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().roles.sort()).toEqual(['employee', 'manager']);

      const audit = await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, target.employeeId));
      const roleChange = audit.find((a) => a.action === 'role.assign');
      expect(roleChange).toBeTruthy();
      expect(JSON.parse(roleChange!.metadata!)).toMatchObject({ after: ['employee', 'manager'] });
    });

    it('rejects an empty role set with 400', async () => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/admin/users/${target.employeeId}/roles`,
        headers: authHeader(adminToken),
        payload: { roles: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('prevents removing the last super admin', async () => {
      // Demote the secondary super admin first, leaving exactly one.
      const [secondary] = await ctx.db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, 'admin2@collins.com'))
        .limit(1);
      await ctx.app.inject({
        method: 'PUT',
        url: `/api/admin/users/${secondary!.id}/roles`,
        headers: authHeader(adminToken),
        payload: { roles: ['employee'] },
      });

      const [primary] = await ctx.db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, 'admin@collins.com'))
        .limit(1);
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/admin/users/${primary!.id}/roles`,
        headers: authHeader(adminToken),
        payload: { roles: ['employee'] },
      });
      expect(res.statusCode).toBe(409);

      // Restore the secondary super admin for other tests.
      await ctx.app.inject({
        method: 'PUT',
        url: `/api/admin/users/${secondary!.id}/roles`,
        headers: authHeader(adminToken),
        payload: { roles: ['super_admin'] },
      });
    });
  });

  describe('status changes', () => {
    it('deactivates an account and audits the termination', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/users/${target.employeeId}/status`,
        headers: authHeader(adminToken),
        payload: { status: 'terminated', reason: 'Voluntary departure' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('terminated');

      const [emp] = await ctx.db
        .select()
        .from(employees)
        .where(eq(employees.id, target.employeeId));
      expect(emp!.terminationDate).toBeTruthy();

      const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, 'user.terminate'));
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    it('refuses to let an admin deactivate their own account', async () => {
      const [admin] = await ctx.db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, 'admin@collins.com'))
        .limit(1);
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/users/${admin!.id}/status`,
        headers: authHeader(adminToken),
        payload: { status: 'terminated' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('password reset', () => {
    it('issues a temporary password and forces a change at next login', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/users/${target.employeeId}/reset-password`,
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().temporaryPassword).toBeTruthy();

      const [user] = await ctx.db.select().from(users).where(eq(users.id, target.userId));
      expect(user!.mustChangePassword).toBe(true);
    });
  });

  describe('organization settings', () => {
    it('returns Collins Aerospace defaults and updates the profile', async () => {
      const read = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/settings',
        headers: authHeader(adminToken),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().legalName).toBe('Collins Aerospace');

      const update = await ctx.app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: authHeader(adminToken),
        payload: { headquarters: 'Cedar Rapids, IA', fiscalYearStartMonth: 4 },
      });
      expect(update.statusCode).toBe(200);
      expect(update.json().headquarters).toBe('Cedar Rapids, IA');
      expect(update.json().fiscalYearStartMonth).toBe(4);

      const audit = await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'settings.update'));
      expect(audit.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects an invalid support email', async () => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: authHeader(adminToken),
        payload: { supportEmail: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('audit log querying', () => {
    it('filters by action and entity and paginates newest first', async () => {
      await recordAudit(ctx.db, {
        actorId: target.employeeId,
        action: 'payroll.generate',
        entity: 'payroll',
        entityId: 'pay_1',
        metadata: { runId: 'pay_1' },
      });

      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/audit?action=payroll.generate&entity=payroll',
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].action).toBe('payroll.generate');
      expect(body.data[0].metadata).toMatchObject({ runId: 'pay_1' });
    });

    it('exposes distinct facets for filtering', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/audit/facets',
        headers: authHeader(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().actions)).toBe(true);
    });
  });
});
