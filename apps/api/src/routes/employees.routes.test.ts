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
    expect(res.json().temporaryPassword).toBeTypeOf('string');
  });

  it('provisions a mixed-case email account that can log in (email normalized)', async () => {
    const token = await login(ctx.app, 'hr@carrier.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'Mixed',
        lastName: 'Case',
        email: 'Mixed.Case@Carrier.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Carrier',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().email).toBe('mixed.case@carrier.com');
    const tempPassword = created.json().temporaryPassword as string;

    // The generated account can authenticate with the normalized email.
    await expect(login(ctx.app, 'mixed.case@carrier.com', tempPassword)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('keeps login working after an email change (users table stays in sync)', async () => {
    const hrToken = await login(ctx.app, 'hr@carrier.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(hrToken),
      payload: {
        firstName: 'Rename',
        lastName: 'Me',
        email: 'rename.me@carrier.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Carrier',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    const { id, temporaryPassword } = created.json();

    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/employees/${id}`,
      headers: authHeader(hrToken),
      payload: { email: 'Renamed.Person@Carrier.com' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().email).toBe('renamed.person@carrier.com');

    // Login must follow the new address; the old one no longer resolves.
    await expect(
      login(ctx.app, 'renamed.person@carrier.com', temporaryPassword),
    ).resolves.toBeTypeOf('string');
    await expect(login(ctx.app, 'rename.me@carrier.com', temporaryPassword)).rejects.toThrow();
  });
});
