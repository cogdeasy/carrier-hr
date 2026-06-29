import type { FastifyInstance } from 'fastify';
import { changePasswordSchema, loginSchema } from '@carrier-hr/shared';
import { parse } from '../lib/validate.js';
import { authenticate, changePassword, getSessionByUserId } from '../services/auth.service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const result = await authenticate(app.db, { ...input, email: input.email.toLowerCase() });
    const token = app.jwt.sign({
      sub: result.user.id,
      employeeId: result.user.employeeId,
      email: result.user.email,
      roles: result.roles,
    });
    return reply.send({ token, user: result.user, permissions: result.permissions });
  });

  app.get('/session', { onRequest: [app.authenticate] }, async (req) => {
    const result = await getSessionByUserId(app.db, req.principal.userId);
    return { user: result.user, permissions: result.permissions };
  });

  app.post('/change-password', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const input = parse(changePasswordSchema, req.body);
    await changePassword(app.db, req.principal.userId, input.currentPassword, input.newPassword);
    return reply.send({ ok: true });
  });

  app.post('/logout', { onRequest: [app.authenticate] }, async (_req, reply) => {
    // Stateless JWT: client discards the token. Endpoint exists for symmetry/audit.
    return reply.send({ ok: true });
  });
}
