import fastifyJwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hasPermission, permissionsForRoles, type Permission } from '@carrier-hr/shared';
import { getEnv } from '../env.js';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import type { AuthPrincipal, JwtPayload } from './types.js';

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
    req.principal = {
      userId: payload.sub,
      employeeId: payload.employeeId,
      email: payload.email,
      roles: payload.roles,
      permissions: permissionsForRoles(payload.roles),
    };
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
