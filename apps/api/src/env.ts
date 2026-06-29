import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// Non-production deployments that omit JWT_SECRET get a fresh random secret per
// process instead of a publicly-known constant, so forged tokens are never
// possible even on staging/shared dev. Tokens simply don't survive a restart
// unless JWT_SECRET is set explicitly.
const EPHEMERAL_JWT_SECRET = randomBytes(32).toString('hex');
const JWT_SECRET_PROVIDED = Boolean(process.env.JWT_SECRET);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    HOST: z.string().default('0.0.0.0'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(16).default(EPHEMERAL_JWT_SECRET),
    JWT_EXPIRES_IN: z.string().default('8h'),
    DATABASE_URL: z.string().default('file:./local.db'),
    DATABASE_AUTH_TOKEN: z.string().optional(),
    SEED_DEFAULT_PASSWORD: z.string().default('Password123!'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !JWT_SECRET_PROVIDED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be set to a strong, unique value in production',
      });
    }
    if (env.NODE_ENV === 'production') {
      const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
      const invalid = origins.filter((o) => o === '*' || !/^https:\/\//.test(o));
      if (origins.length === 0 || invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message:
            'CORS_ORIGINS must be a non-empty list of explicit https:// origins in production (no "*" wildcard)',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  if (cached.NODE_ENV !== 'production' && !JWT_SECRET_PROVIDED) {
    console.warn(
      `[env] WARNING: JWT_SECRET is not set (NODE_ENV=${cached.NODE_ENV}); using an ephemeral ` +
        'random secret for this process. Sessions will be invalidated on restart. ' +
        'Set JWT_SECRET to a strong, unique value for stable sessions and before exposing this server to any network.',
    );
  }
  return cached;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
