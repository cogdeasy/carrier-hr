import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';

describe('employee directory & RBAC', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr@carrier.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'worker@carrier.com', roles: ['employee'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a paginated directory to authenticated users', async () => {
    const token = await login(ctx.app, 'worker@carrier.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?pageSize=10',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('forbids a regular employee from creating employees', async () => {
    const token = await login(ctx.app, 'worker@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'New',
        lastName: 'Hire',
        email: 'new.hire@carrier.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Carrier',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows an HR admin to create an employee', async () => {
    const token = await login(ctx.app, 'hr@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'New',
        lastName: 'Hire',
        email: 'new.hire@carrier.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Carrier',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe('new.hire@carrier.com');
    expect(res.json().employeeNumber).toBeTypeOf('string');
  });
});
