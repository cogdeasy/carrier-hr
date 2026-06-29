import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { getEnv } from '../env.js';
import * as schema from './schema.js';

export type Database = LibSQLDatabase<typeof schema>;

let client: Client | null = null;
let dbInstance: Database | null = null;

export function getClient(): Client {
  if (client) return client;
  const env = getEnv();
  client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  return client;
}

export function getDb(): Database {
  if (dbInstance) return dbInstance;
  dbInstance = drizzle(getClient(), { schema });
  return dbInstance;
}

/** Build a fresh in-memory database instance (used by integration tests). */
export function createInMemoryDb(): { db: Database; client: Client } {
  const c = createClient({ url: ':memory:' });
  return { db: drizzle(c, { schema }), client: c };
}

export { schema };
