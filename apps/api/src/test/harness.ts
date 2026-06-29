import { migrate } from 'drizzle-orm/libsql/migrator';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@collins-hr/shared';
import { buildApp } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { createInMemoryDb, type Database } from '../db/client.js';
import { MIGRATIONS_FOLDER } from '../db/migrate.js';
import { createId } from '../lib/ids.js';
import * as t from '../db/schema.js';

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const { db, client } = createInMemoryDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  const app = await buildApp({ db, logger: false });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      client.close();
    },
  };
}

export interface SeededUser {
  employeeId: string;
  userId: string;
  email: string;
}

export async function seedUser(
  db: Database,
  options: {
    email: string;
    roles: Role[];
    password?: string;
    firstName?: string;
    lastName?: string;
    managerId?: string | null;
    department?: string;
    status?: string;
  },
): Promise<SeededUser> {
  const employeeId = createId('emp');
  const userId = createId('usr');
  const number = `C${Math.floor(Math.random() * 100000)}`;
  await db.insert(t.employees).values({
    id: employeeId,
    employeeNumber: number,
    firstName: options.firstName ?? 'Test',
    lastName: options.lastName ?? 'User',
    email: options.email,
    jobTitle: 'Engineer',
    department: options.department ?? 'Engineering',
    location: 'Palm Beach Gardens, FL',
    managerId: options.managerId ?? null,
    hireDate: '2022-01-01',
    status: options.status ?? 'active',
  });
  await db.insert(t.users).values({
    id: userId,
    employeeId,
    email: options.email,
    passwordHash: await hashPassword(options.password ?? 'Password123!'),
  });
  for (const role of options.roles) {
    await db.insert(t.userRoles).values({ id: createId('rol'), userId, role });
  }
  return { employeeId, userId, email: options.email };
}

export async function login(
  app: FastifyInstance,
  email: string,
  password = 'Password123!',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed (${res.statusCode}): ${res.body}`);
  }
  return res.json().token as string;
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
