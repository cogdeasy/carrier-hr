import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  hasPermission,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeSortField,
  type OrgNode,
  type Paginated,
  type Role,
  type SortDirection,
  type TerminateEmployeeInput,
  type UpdateEmployeeInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { employees, userRoles, users } from '../db/schema.js';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { offset, paginate } from '../lib/pagination.js';
import { nowIso } from '../lib/dates.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { toEmployee, toEmployeeRef, displayName } from './mappers.js';
import { rolesByEmployee, rolesForEmployee } from './roles.service.js';

export interface ListEmployeesParams {
  page: number;
  pageSize: number;
  search?: string;
  department?: string;
  division?: string;
  location?: string;
  status?: string;
  employmentType?: string;
  managerId?: string;
  sort?: EmployeeSortField;
  sortDir?: SortDirection;
}

/** Identity of the principal making a request, used for PII scoping. */
export interface Viewer {
  employeeId: string;
  roles: Role[];
}

/** PII fields hidden from peers who are neither the subject, the subject's
 * manager, nor an HR/admin role. */
const PII_FIELDS = ['personalPhone', 'dateOfBirth', 'address', 'emergencyContact'] as const;

export async function listEmployees(
  db: Database,
  params: ListEmployeesParams,
  viewer?: Viewer,
): Promise<Paginated<Employee>> {
  const filters: SQL[] = [];
  if (params.search) {
    const escaped = params.search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    const term = `%${escaped}%`;
    const columns = [
      employees.firstName,
      employees.lastName,
      employees.email,
      employees.jobTitle,
      employees.department,
    ];
    const searchClause = or(...columns.map((col) => sql`lower(${col}) like ${term} escape '\\'`));
    if (searchClause) filters.push(searchClause);
  }
  if (params.department) filters.push(eq(employees.department, params.department));
  if (params.division) filters.push(eq(employees.division, params.division));
  if (params.location) filters.push(eq(employees.location, params.location));
  if (params.status) filters.push(eq(employees.status, params.status));
  if (params.employmentType) filters.push(eq(employees.employmentType, params.employmentType));
  if (params.managerId) filters.push(eq(employees.managerId, params.managerId));

  const where = filters.length ? and(...filters) : undefined;

  const totalRows = await db.select({ value: count() }).from(employees).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(employees)
    .where(where)
    .orderBy(...orderByClause(params.sort ?? 'name', params.sortDir ?? 'asc'))
    .limit(params.pageSize)
    .offset(offset(params.page, params.pageSize));

  const roleMap = await rolesByEmployee(
    db,
    rows.map((r) => r.id),
  );
  const data = rows.map((r) => {
    const employee = toEmployee(r, roleMap.get(r.id) ?? []);
    return viewer ? scopeEmployeePii(employee, viewer) : employee;
  });
  return paginate(data, total, params.page, params.pageSize);
}

const SORT_COLUMNS: Record<EmployeeSortField, SQLiteColumn[]> = {
  name: [employees.lastName, employees.firstName],
  jobTitle: [employees.jobTitle],
  department: [employees.department],
  division: [employees.division],
  location: [employees.location],
  status: [employees.status],
  hireDate: [employees.hireDate],
};

function orderByClause(sort: EmployeeSortField, dir: SortDirection): SQL[] {
  const direction = dir === 'desc' ? desc : asc;
  const primary = SORT_COLUMNS[sort].map((col) => direction(col));
  // A stable, deterministic tiebreak keeps pagination consistent across pages.
  return sort === 'name' ? primary : [...primary, asc(employees.lastName), asc(employees.firstName)];
}

export async function getEmployee(db: Database, id: string): Promise<Employee> {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) throw NotFound('Employee not found');
  const roles = await rolesForEmployee(db, id);
  return toEmployee(row, roles);
}

/** Whether `viewer` may see the subject's full PII (personal phone, DOB,
 * home address, emergency contact). True for the subject, the subject's
 * direct manager, and any role with directory write access (HR/admin). */
export function canViewPii(viewer: Viewer, subject: Pick<Employee, 'id' | 'managerId'>): boolean {
  return (
    viewer.employeeId === subject.id ||
    subject.managerId === viewer.employeeId ||
    hasPermission(viewer.roles, 'employee:write')
  );
}

/** Strips sensitive fields from an employee a viewer is not entitled to see. */
export function scopeEmployeePii(employee: Employee, viewer: Viewer): Employee {
  if (canViewPii(viewer, employee)) return employee;
  const redacted = { ...employee };
  for (const field of PII_FIELDS) redacted[field] = null;
  return redacted;
}

/** Fetches an employee with PII redacted according to the viewer's relationship. */
export async function getEmployeeForViewer(
  db: Database,
  id: string,
  viewer: Viewer,
): Promise<Employee> {
  return scopeEmployeePii(await getEmployee(db, id), viewer);
}

async function nextEmployeeNumber(db: Database): Promise<string> {
  const rows = await db.select({ number: employees.employeeNumber }).from(employees);
  let maxN = 1000;
  for (const r of rows) {
    const match = /^C(\d+)$/.exec(r.number);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }
  return `C${maxN + 1}`;
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}

export interface ProvisionedEmployee {
  employee: Employee;
  /** One-time temporary password the admin relays to the new hire. */
  temporaryPassword: string;
}

export async function createEmployee(
  db: Database,
  input: CreateEmployeeInput,
): Promise<ProvisionedEmployee> {
  // Emails are matched case-insensitively at login (always lowercased), so we
  // normalize on the way in to keep the directory and credentials consistent.
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);
  if (existing) throw Conflict('An employee with this email already exists');

  const id = createId('emp');
  const now = nowIso();
  const maxAttempts = 5;
  let created = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const employeeNumber = await nextEmployeeNumber(db);
    try {
      await db.insert(employees).values({
        id,
        employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        workPhone: input.workPhone ?? null,
        jobTitle: input.jobTitle,
        department: input.department,
        division: input.division,
        location: input.location,
        employmentType: input.employmentType,
        status: 'active',
        managerId: input.managerId ?? null,
        hireDate: input.hireDate,
        createdAt: now,
        updatedAt: now,
      });
      created = true;
      break;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }
  if (!created) throw Conflict('Could not allocate a unique employee number, please retry');

  // Provision a login so the new hire can sign in. Each account gets its own
  // high-entropy temporary password (never a shared default) and is forced to
  // change it on first login.
  const roles: Role[] = input.roles.length ? input.roles : ['employee'];
  const userId = createId('usr');
  const temporaryPassword = generateTemporaryPassword();
  await db.insert(users).values({
    id: userId,
    employeeId: id,
    email,
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
  });
  for (const role of roles) {
    await db.insert(userRoles).values({ id: createId('rol'), userId, role });
  }

  const employee = await getEmployee(db, id);
  return { employee, temporaryPassword };
}

export async function updateEmployee(
  db: Database,
  id: string,
  input: UpdateEmployeeInput,
): Promise<Employee> {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) throw NotFound('Employee not found');

  const nextEmail = input.email ? input.email.toLowerCase() : row.email;

  await db
    .update(employees)
    .set({
      firstName: input.firstName ?? row.firstName,
      lastName: input.lastName ?? row.lastName,
      email: nextEmail,
      workPhone: input.workPhone === undefined ? row.workPhone : input.workPhone,
      personalPhone: input.personalPhone === undefined ? row.personalPhone : input.personalPhone,
      jobTitle: input.jobTitle ?? row.jobTitle,
      department: input.department ?? row.department,
      division: input.division ?? row.division,
      location: input.location ?? row.location,
      employmentType: input.employmentType ?? row.employmentType,
      status: input.status ?? row.status,
      managerId: input.managerId === undefined ? row.managerId : input.managerId,
      terminationDate:
        input.terminationDate === undefined ? row.terminationDate : input.terminationDate,
      address: input.address === undefined ? row.address : JSON.stringify(input.address),
      emergencyContact:
        input.emergencyContact === undefined
          ? row.emergencyContact
          : JSON.stringify(input.emergencyContact),
      updatedAt: nowIso(),
    })
    .where(eq(employees.id, id));

  // Keep the login credential in sync — auth queries the users table, not the
  // directory, so a stale users.email would lock the employee out.
  if (nextEmail !== row.email) {
    await db
      .update(users)
      .set({ email: nextEmail, updatedAt: nowIso() })
      .where(eq(users.employeeId, id));
  }

  return getEmployee(db, id);
}

/** Terminates or places an employee on leave, recording the effective date.
 * Idempotent guards prevent re-terminating an already inactive record. */
export async function terminateEmployee(
  db: Database,
  id: string,
  input: TerminateEmployeeInput,
): Promise<Employee> {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) throw NotFound('Employee not found');
  if (row.status === 'terminated') throw Conflict('Employee is already terminated');

  await db
    .update(employees)
    .set({
      status: input.status,
      terminationDate: input.terminationDate,
      updatedAt: nowIso(),
    })
    .where(eq(employees.id, id));

  return getEmployee(db, id);
}

/** Reactivates a terminated or on-leave employee, clearing the termination date. */
export async function reactivateEmployee(db: Database, id: string): Promise<Employee> {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) throw NotFound('Employee not found');
  if (row.status === 'active') throw BadRequest('Employee is already active');

  await db
    .update(employees)
    .set({ status: 'active', terminationDate: null, updatedAt: nowIso() })
    .where(eq(employees.id, id));

  return getEmployee(db, id);
}

export async function setEmployeeRoles(
  db: Database,
  employeeId: string,
  roles: Role[],
): Promise<void> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (!user) throw NotFound('User account not found for employee');
  await db.delete(userRoles).where(eq(userRoles.userId, user.id));
  for (const role of roles) {
    await db.insert(userRoles).values({ id: createId('rol'), userId: user.id, role });
  }
}

export async function listDirectReports(
  db: Database,
  managerId: string,
  viewer?: Viewer,
): Promise<Employee[]> {
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.managerId, managerId))
    .orderBy(asc(employees.lastName));
  const roleMap = await rolesByEmployee(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const employee = toEmployee(r, roleMap.get(r.id) ?? []);
    return viewer ? scopeEmployeePii(employee, viewer) : employee;
  });
}

/** Builds the org chart rooted at employees with no manager (or a given root).
 *
 * The tree is materialized with a depth-first walk guarded by a visited set so
 * that managerId cycles (A→B→A) or self-references can never produce an
 * infinite structure; any record not reachable from a genuine root — i.e. one
 * trapped in a cycle — is surfaced as an additional root so no one disappears. */
export async function getOrgChart(db: Database, rootId?: string): Promise<OrgNode[]> {
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.status, 'active'))
    .orderBy(asc(employees.lastName), asc(employees.firstName));

  const childIds = new Map<string, string[]>();
  const present = new Set(rows.map((r) => r.id));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const rootIds: string[] = [];
  for (const row of rows) {
    const managerPresent = row.managerId && row.managerId !== row.id && present.has(row.managerId);
    if (managerPresent) {
      const siblings = childIds.get(row.managerId!) ?? [];
      siblings.push(row.id);
      childIds.set(row.managerId!, siblings);
    } else {
      rootIds.push(row.id);
    }
  }

  const visited = new Set<string>();
  const build = (id: string): OrgNode => {
    visited.add(id);
    const row = rowById.get(id)!;
    const reports = (childIds.get(id) ?? [])
      .filter((childId) => !visited.has(childId))
      .map((childId) => build(childId));
    return {
      ...toEmployeeRef(row),
      managerId: row.managerId,
      status: row.status as OrgNode['status'],
      location: row.location,
      reports,
    };
  };

  if (rootId) {
    if (!present.has(rootId)) return [];
    return [build(rootId)];
  }

  const roots = rootIds.map((id) => build(id));
  // Defensively re-home anyone stranded inside a managerId cycle.
  for (const row of rows) {
    if (!visited.has(row.id)) roots.push(build(row.id));
  }
  return roots;
}

export async function recentHires(db: Database, limit = 5): Promise<Employee[]> {
  const rows = await db
    .select()
    .from(employees)
    .orderBy(desc(employees.hireDate))
    .limit(limit);
  const roleMap = await rolesByEmployee(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toEmployee(r, roleMap.get(r.id) ?? []));
}

export { displayName };
