import { eq } from 'drizzle-orm';
import type { AuthUser, LoginInput, Role } from '@carrier-hr/shared';
import { permissionsForRoles } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { employees, userRoles, users } from '../db/schema.js';
import { Unauthorized } from '../lib/errors.js';
import { nowIso } from '../lib/dates.js';
import { verifyPassword, hashPassword } from '../auth/password.js';
import { displayName } from './mappers.js';

export interface AuthResult {
  user: AuthUser;
  roles: Role[];
  permissions: string[];
}

export async function authenticate(db: Database, input: LoginInput): Promise<AuthResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);
  if (!user) throw Unauthorized('Invalid email or password');

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw Unauthorized('Invalid email or password');

  await db.update(users).set({ lastLoginAt: nowIso() }).where(eq(users.id, user.id));

  return buildAuthResult(db, user.id, user.employeeId, user.email, user.mustChangePassword);
}

export async function buildAuthResult(
  db: Database,
  userId: string,
  employeeId: string,
  email: string,
  mustChangePassword: boolean,
): Promise<AuthResult> {
  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  const roles = roleRows.map((r) => r.role as Role);

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) throw Unauthorized('Employee record not found');

  const user: AuthUser = {
    id: userId,
    email,
    roles,
    employeeId,
    displayName: displayName(employee.firstName, employee.lastName),
    avatarUrl: employee.avatarUrl,
    mustChangePassword,
  };
  return { user, roles, permissions: permissionsForRoles(roles) };
}

export async function getSessionByUserId(db: Database, userId: string): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw Unauthorized();
  return buildAuthResult(db, user.id, user.employeeId, user.email, user.mustChangePassword);
}

export async function changePassword(
  db: Database,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw Unauthorized();
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw Unauthorized('Current password is incorrect');
  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: nowIso() })
    .where(eq(users.id, userId));
}
