import { inArray } from 'drizzle-orm';
import type { Role } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { userRoles, users } from '../db/schema.js';

/** Returns a map of employeeId -> roles for the supplied employee ids. */
export async function rolesByEmployee(
  db: Database,
  employeeIds: string[],
): Promise<Map<string, Role[]>> {
  const result = new Map<string, Role[]>();
  if (employeeIds.length === 0) return result;

  const userRows = await db
    .select({ userId: users.id, employeeId: users.employeeId })
    .from(users)
    .where(inArray(users.employeeId, employeeIds));

  if (userRows.length === 0) return result;

  const userIdToEmployee = new Map(userRows.map((u) => [u.userId, u.employeeId]));
  const roleRows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(
      inArray(
        userRoles.userId,
        userRows.map((u) => u.userId),
      ),
    );

  for (const row of roleRows) {
    const employeeId = userIdToEmployee.get(row.userId);
    if (!employeeId) continue;
    const list = result.get(employeeId) ?? [];
    list.push(row.role as Role);
    result.set(employeeId, list);
  }
  return result;
}

export async function rolesForEmployee(db: Database, employeeId: string): Promise<Role[]> {
  const map = await rolesByEmployee(db, [employeeId]);
  return map.get(employeeId) ?? [];
}
