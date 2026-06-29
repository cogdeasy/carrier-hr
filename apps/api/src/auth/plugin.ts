import fastifyJwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { hasPermission, permissionsForRoles, type Permission } from '@collins-hr/shared';
import { users } from '../db/schema.js';
import { getEnv } from '../env.js';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { rolesForEmployee } from '../services/roles.service.js';
import type { AuthPrincipal, JwtPayload } from './types.js';

// Routes a principal with a pending forced password change may still reach.
// Everything else is blocked until they rotate the temporary password.
const PASSWORD_CHANGE_ALLOWLIST = new Set([
  'POST:/api/auth/change-password',
  'GET:/api/auth/session',
  'POST:/api/auth/logout',
]);

declare module 'fastify' {
  interface FastifyRequest {
    principal: AuthPrincipal;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export const authPlugin = fp(async (app) => {
  const env = getEnv();

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: JwtPayload;
    try {
      payload = await req.jwtVerify<JwtPayload>();
    } catch {
      throw Unauthorized('Invalid or expired session');
    }
    // Re-read roles from the database so revoked/changed roles take effect
    // immediately rather than persisting until the token expires.
    const roles = await rolesForEmployee(app.db, payload.employeeId);
    const [user] = await app.db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!user) throw Unauthorized('Session is no longer valid');
    req.principal = {
      userId: payload.sub,
      employeeId: payload.employeeId,
      email: payload.email,
      roles,
      permissions: permissionsForRoles(roles),
      mustChangePassword: user.mustChangePassword,
    };

    // Force a password rotation before any other action: a freshly provisioned
    // account holds a temporary password and must not be usable indefinitely.
    if (user.mustChangePassword) {
      const route = `${req.method}:${req.routeOptions.url ?? req.url}`;
      if (!PASSWORD_CHANGE_ALLOWLIST.has(route)) {
        throw Forbidden('You must change your password before continuing');
      }
    }
  });

  app.decorate('requirePermission', (permission: Permission) => {
    return async (req: FastifyRequest) => {
      if (!req.principal) throw Unauthorized();
      if (!hasPermission(req.principal.roles, permission)) {
        throw Forbidden(`Missing required permission: ${permission}`);
      }
    };
  });
});
