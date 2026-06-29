import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';

describe('employee directory & RBAC', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr@collins.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'worker@collins.com', roles: ['employee'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a paginated directory to authenticated users', async () => {
    const token = await login(ctx.app, 'worker@collins.com');
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
    const token = await login(ctx.app, 'worker@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'New',
        lastName: 'Hire',
        email: 'new.hire@collins.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Avionics',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows an HR admin to create an employee', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'New',
        lastName: 'Hire',
        email: 'new.hire@collins.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Avionics',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe('new.hire@collins.com');
    expect(res.json().employeeNumber).toBeTypeOf('string');
    expect(res.json().temporaryPassword).toBeTypeOf('string');
  });

  it('provisions a mixed-case email account that can log in (email normalized)', async () => {
    const token = await login(ctx.app, 'hr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(token),
      payload: {
        firstName: 'Mixed',
        lastName: 'Case',
        email: 'Mixed.Case@Collins.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Avionics',
        location: 'Charlotte, NC',
        hireDate: '2026-01-15',
        employmentType: 'full_time',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().email).toBe('mixed.case@collins.com');
    const tempPassword = created.json().temporaryPassword as string;

    // The generated account can authenticate with the normalized email.
    await expect(login(ctx.app, 'mixed.case@collins.com', tempPassword)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('keeps login working after an email change (users table stays in sync)', async () => {
    const hrToken = await login(ctx.app, 'hr@collins.com');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: authHeader(hrToken),
      payload: {
        firstName: 'Rename',
        lastName: 'Me',
        email: 'rename.me@collins.com',
        jobTitle: 'Analyst',
        department: 'Finance',
        division: 'Avionics',
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
      payload: { email: 'Renamed.Person@Collins.com' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().email).toBe('renamed.person@collins.com');

    // Login must follow the new address; the old one no longer resolves.
    await expect(
      login(ctx.app, 'renamed.person@collins.com', temporaryPassword),
    ).resolves.toBeTypeOf('string');
    await expect(login(ctx.app, 'rename.me@collins.com', temporaryPassword)).rejects.toThrow();
  });
});

describe('directory filtering, pagination & sorting', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr2@collins.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, {
      email: 'eng.aaron@collins.com',
      roles: ['employee'],
      firstName: 'Aaron',
      lastName: 'Adams',
      department: 'Engineering',
    });
    await seedUser(ctx.db, {
      email: 'eng.zoe@collins.com',
      roles: ['employee'],
      firstName: 'Zoe',
      lastName: 'Zimmer',
      department: 'Engineering',
    });
    await seedUser(ctx.db, {
      email: 'fin.mike@collins.com',
      roles: ['employee'],
      firstName: 'Mike',
      lastName: 'Miller',
      department: 'Finance',
    });
    await seedUser(ctx.db, {
      email: 'former@collins.com',
      roles: ['employee'],
      firstName: 'Former',
      lastName: 'Worker',
      department: 'Finance',
      status: 'terminated',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('filters by department', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?department=Engineering&pageSize=100',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data.every((e: { department: string }) => e.department === 'Engineering')).toBe(true);
  });

  it('filters by status', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?status=terminated&pageSize=100',
      headers: authHeader(token),
    });
    const body = res.json();
    expect(body.data.every((e: { status: string }) => e.status === 'terminated')).toBe(true);
    expect(body.data.some((e: { email: string }) => e.email === 'former@collins.com')).toBe(true);
  });

  it('rejects an unknown status value', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?status=bogus',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it('searches across name and email', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?search=zimmer',
      headers: authHeader(token),
    });
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe('eng.zoe@collins.com');
  });

  it('paginates and reports totals', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?pageSize=2&page=1',
      headers: authHeader(token),
    });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pageSize).toBe(2);
    expect(body.total).toBeGreaterThanOrEqual(5);
    expect(body.totalPages).toBe(Math.ceil(body.total / 2));
  });

  it('sorts by name ascending and descending', async () => {
    const token = await login(ctx.app, 'hr2@collins.com');
    const asc = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?sort=name&sortDir=asc&pageSize=100',
      headers: authHeader(token),
    });
    const desc = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees?sort=name&sortDir=desc&pageSize=100',
      headers: authHeader(token),
    });
    const ascNames = asc.json().data.map((e: { lastName: string }) => e.lastName);
    const descNames = desc.json().data.map((e: { lastName: string }) => e.lastName);
    expect(ascNames[0]).toBe('Adams');
    expect(descNames[0]).toBe('Zimmer');
    expect([...ascNames].reverse()).toEqual(descNames);
  });
});

describe('profile PII scoping', () => {
  let ctx: TestContext;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr3@collins.com', roles: ['hr_admin'] });
    const mgr = await seedUser(ctx.db, { email: 'boss@collins.com', roles: ['manager'] });
    const subject = await seedUser(ctx.db, {
      email: 'subject@collins.com',
      roles: ['employee'],
      managerId: mgr.employeeId,
    });
    subjectId = subject.employeeId;
    await seedUser(ctx.db, { email: 'peer@collins.com', roles: ['employee'] });

    const hrToken = await login(ctx.app, 'hr3@collins.com');
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/employees/${subjectId}`,
      headers: authHeader(hrToken),
      payload: {
        personalPhone: '+1-555-0100',
        address: {
          line1: '1 Main St',
          city: 'Cedar Rapids',
          state: 'IA',
          postalCode: '52401',
          country: 'USA',
        },
        emergencyContact: { name: 'Jordan', relationship: 'Spouse', phone: '+1-555-0199' },
      },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('redacts PII from an unrelated peer', async () => {
    const token = await login(ctx.app, 'peer@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/employees/${subjectId}`,
      headers: authHeader(token),
    });
    const body = res.json();
    expect(body.email).toBe('subject@collins.com');
    expect(body.personalPhone).toBeNull();
    expect(body.address).toBeNull();
    expect(body.emergencyContact).toBeNull();
  });

  it("exposes PII to the subject's manager", async () => {
    const token = await login(ctx.app, 'boss@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/employees/${subjectId}`,
      headers: authHeader(token),
    });
    expect(res.json().personalPhone).toBe('+1-555-0100');
  });

  it('exposes PII to HR', async () => {
    const token = await login(ctx.app, 'hr3@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/employees/${subjectId}`,
      headers: authHeader(token),
    });
    expect(res.json().address.city).toBe('Cedar Rapids');
  });
});

describe('lifecycle: terminate & reactivate', () => {
  let ctx: TestContext;
  let targetId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr4@collins.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'staff@collins.com', roles: ['employee'] });
    const target = await seedUser(ctx.db, { email: 'leaver@collins.com', roles: ['employee'] });
    targetId = target.employeeId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('forbids a regular employee from terminating', async () => {
    const token = await login(ctx.app, 'staff@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/terminate`,
      headers: authHeader(token),
      payload: { terminationDate: '2026-06-30' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('terminates an employee and records the date', async () => {
    const token = await login(ctx.app, 'hr4@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/terminate`,
      headers: authHeader(token),
      payload: { terminationDate: '2026-06-30', reason: 'Resignation' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('terminated');
    expect(res.json().terminationDate).toBe('2026-06-30');
  });

  it('rejects terminating an already-terminated employee', async () => {
    const token = await login(ctx.app, 'hr4@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/terminate`,
      headers: authHeader(token),
      payload: { terminationDate: '2026-07-01' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('reactivates a terminated employee and clears the date', async () => {
    const token = await login(ctx.app, 'hr4@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/reactivate`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
    expect(res.json().terminationDate).toBeNull();
  });

  it('rejects reactivating an already-active employee', async () => {
    const token = await login(ctx.app, 'hr4@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/reactivate`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid termination date', async () => {
    const token = await login(ctx.app, 'hr4@collins.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${targetId}/terminate`,
      headers: authHeader(token),
      payload: { terminationDate: '06/30/2026' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('org chart', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'hr5@collins.com', roles: ['hr_admin'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a nested tree rooted at managerless employees', async () => {
    const token = await login(ctx.app, 'hr5@collins.com');
    const root = await seedUser(ctx.db, {
      email: 'chief@collins.com',
      roles: ['executive'],
      managerId: null,
    });
    await seedUser(ctx.db, {
      email: 'report1@collins.com',
      roles: ['employee'],
      managerId: root.employeeId,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/employees/org-chart?rootId=${root.employeeId}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const tree = res.json();
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(root.employeeId);
    expect(tree[0].reports.length).toBeGreaterThanOrEqual(1);
  });

  it('does not loop forever when managerId forms a cycle', async () => {
    const token = await login(ctx.app, 'hr5@collins.com');
    const a = await seedUser(ctx.db, { email: 'cycle.a@collins.com', roles: ['employee'] });
    const b = await seedUser(ctx.db, {
      email: 'cycle.b@collins.com',
      roles: ['employee'],
      managerId: a.employeeId,
    });
    // Close the loop: a now reports to b while b reports to a.
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/employees/${a.employeeId}`,
      headers: authHeader(token),
      payload: { managerId: b.employeeId },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employees/org-chart',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const ids = JSON.stringify(res.json());
    expect(ids).toContain(a.employeeId);
    expect(ids).toContain(b.employeeId);
  });
});
