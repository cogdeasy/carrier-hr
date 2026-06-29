import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';

describe('auth routes', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'employee@carrier.com', roles: ['employee'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects invalid credentials', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'employee@carrier.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('issues a token and returns permissions for valid credentials', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'employee@carrier.com', password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.user.email).toBe('employee@carrier.com');
    expect(body.permissions).toContain('timeoff:request');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the current session for an authenticated user', async () => {
    const token = await login(ctx.app, 'employee@carrier.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('employee@carrier.com');
  });

  it('allows changing the password and logging in with the new one', async () => {
    await seedUser(ctx.db, { email: 'changer@carrier.com', roles: ['employee'] });
    const token = await login(ctx.app, 'changer@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: authHeader(token),
      payload: {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      },
    });
    expect(res.statusCode).toBe(200);
    await expect(login(ctx.app, 'changer@carrier.com', 'NewPassword456!')).resolves.toBeTypeOf(
      'string',
    );
  });
});
