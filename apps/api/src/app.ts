import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authPlugin } from './auth/plugin.js';
import { getDb, type Database } from './db/client.js';
import { corsOrigins, getEnv } from './env.js';
import { AppError } from './lib/errors.js';
import { registerRoutes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface BuildAppOptions {
  db?: Database;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: options.logger ?? (env.NODE_ENV !== 'test'),
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  app.decorate('db', options.db ?? getDb());

  await app.register(cors, {
    origin: corsOrigins(env),
    credentials: true,
  });

  // Rate limiting protects against brute-force and abuse. Disabled under test
  // to keep the suite deterministic; per-route stricter limits live on the
  // auth endpoints (see auth.routes.ts).
  if (env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
    });
  }

  await app.register(authPlugin);

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: { code: 'bad_request', message: 'Validation failed', details: error.flatten() } });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: 'request_error', message: error.message } });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'internal_error', message: 'An unexpected error occurred' } });
  });

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(registerRoutes, { prefix: '/api' });

  return app;
}
