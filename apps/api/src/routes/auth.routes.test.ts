import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { users } from '../db/schema.js';

describe('auth routes', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'employee@collins.com', roles: ['employee'] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects invalid credentials', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'employee@collins.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('issues a token and returns permissions for valid credentials', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'employee@collins.com', password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.user.email).toBe('employee@collins.com');
    expect(body.permissions).toContain('timeoff:request');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the current session for an authenticated user', async () => {
    const token = await login(ctx.app, 'employee@collins.com');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('employee@collins.com');
  });

  it('allows changing the password and logging in with the new one', async () => {
    await seedUser(ctx.db, { email: 'changer@collins.com', roles: ['employee'] });
    const token = await login(ctx.app, 'changer@collins.com');
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
    await expect(login(ctx.app, 'changer@collins.com', 'NewPassword456!')).resolves.toBeTypeOf(
      'string',
    );
  });

  it('blocks a user with a pending password change from other routes until they rotate it', async () => {
    const seeded = await seedUser(ctx.db, { email: 'temp@collins.com', roles: ['employee'] });
    await ctx.db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, seeded.userId));
    const token = await login(ctx.app, 'temp@collins.com');

    // Any normal route is forbidden while the temporary password stands.
    const blocked = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: authHeader(token),
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.message).toContain('change your password');

    // The session route stays reachable so the client can detect the state.
    const session = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: authHeader(token),
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.mustChangePassword).toBe(true);

    // Changing the password clears the flag and unblocks the rest of the app.
    const changed = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: authHeader(token),
      payload: {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      },
    });
    expect(changed.statusCode).toBe(200);

    const newToken = await login(ctx.app, 'temp@collins.com', 'NewPassword456!');
    const allowed = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: authHeader(newToken),
    });
    expect(allowed.statusCode).toBe(200);
  });
});
