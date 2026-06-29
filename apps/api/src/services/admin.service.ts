import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type {
  AdminUser,
  AuditLog,
  AuditLogQuery,
  CompanyHoliday,
  OrgSettings,
  Paginated,
  Role,
  UpdateOrgSettingsInput,
} from '@collins-hr/shared';
import { EMPLOYEE_STATUSES } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  auditLogs,
  companyHolidays,
  employees,
  orgSettings,
  userRoles,
  users,
} from '../db/schema.js';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { offset, paginate } from '../lib/pagination.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { displayName } from './mappers.js';

const ORG_SETTINGS_ID = 'org';

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface RecordAuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append a sensitive-action record to the immutable audit trail. Other modules
 * may call this to log role changes, terminations, payroll runs, signatures,
 * etc. Failures here never block the originating action — auditing is
 * best-effort and must not mask the primary mutation's result.
 */
export async function recordAudit(db: Database, input: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: createId('aud'),
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch {
    // Swallow audit write failures: the caller's action has already happened
    // and an audit outage must not surface as a user-facing error.
  }
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function listAuditLogs(
  db: Database,
  params: AuditLogQuery,
): Promise<Paginated<AuditLog>> {
  const filters: SQL[] = [];
  if (params.action) filters.push(eq(auditLogs.action, params.action));
  if (params.entity) filters.push(eq(auditLogs.entity, params.entity));
  if (params.actorId) filters.push(eq(auditLogs.actorId, params.actorId));
  if (params.from) filters.push(gte(auditLogs.createdAt, params.from));
  if (params.to) filters.push(lte(auditLogs.createdAt, params.to));
  const where = filters.length ? and(...filters) : undefined;

  const totalRows = await db.select({ value: count() }).from(auditLogs).where(where);
  const total = totalRows[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(params.pageSize)
    .offset(offset(params.page, params.pageSize));

  // Batch-resolve actor display names to avoid an N+1 over employees.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id))),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const empRows = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(inArray(employees.id, actorIds));
    for (const e of empRows) nameById.set(e.id, displayName(e.firstName, e.lastName));
  }

  const data: AuditLog[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorName: r.actorId ? (nameById.get(r.actorId) ?? null) : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    metadata: parseMetadata(r.metadata),
    createdAt: r.createdAt,
  }));
  return paginate(data, total, params.page, params.pageSize);
}

/** Distinct action and entity values, for populating audit filter dropdowns. */
export async function auditFacets(
  db: Database,
): Promise<{ actions: string[]; entities: string[] }> {
  const actionRows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(asc(auditLogs.action));
  const entityRows = await db
    .selectDistinct({ entity: auditLogs.entity })
    .from(auditLogs)
    .orderBy(asc(auditLogs.entity));
  return {
    actions: actionRows.map((r) => r.action),
    entities: entityRows.map((r) => r.entity),
  };
}

// ---------------------------------------------------------------------------
// User & role management
// ---------------------------------------------------------------------------

export interface ListAdminUsersParams {
  page: number;
  pageSize: number;
  search?: string;
  role?: Role;
  status?: string;
}

async function rolesByUser(db: Database, userIds: string[]): Promise<Map<string, Role[]>> {
  const result = new Map<string, Role[]>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(inArray(userRoles.userId, userIds));
  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push(row.role as Role);
    result.set(row.userId, list);
  }
  return result;
}

export async function listAdminUsers(
  db: Database,
  params: ListAdminUsersParams,
): Promise<Paginated<AdminUser>> {
  const filters: SQL[] = [];
  if (params.search) {
    const escaped = params.search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    const term = `%${escaped}%`;
    const clause = sql`(lower(${employees.firstName}) like ${term} escape '\\' or lower(${employees.lastName}) like ${term} escape '\\' or lower(${users.email}) like ${term} escape '\\')`;
    filters.push(clause);
  }
  if (params.status) filters.push(eq(employees.status, params.status));
  const where = filters.length ? and(...filters) : undefined;

  // Role is stored in a child table; resolve the matching user ids first so the
  // filter applies before pagination.
  let roleUserIds: string[] | null = null;
  if (params.role) {
    const roleRows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, params.role));
    roleUserIds = roleRows.map((r) => r.userId);
    if (roleUserIds.length === 0) return paginate([], 0, params.page, params.pageSize);
  }

  const roleWhere = roleUserIds ? inArray(users.id, roleUserIds) : undefined;
  const finalWhere =
    where && roleWhere ? and(where, roleWhere) : (where ?? roleWhere ?? undefined);

  const base = db
    .select({
      userId: users.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: users.email,
      jobTitle: employees.jobTitle,
      department: employees.department,
      status: employees.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id));

  const totalRows = await db
    .select({ value: count() })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(finalWhere);
  const total = totalRows[0]?.value ?? 0;

  const rows = await base
    .where(finalWhere)
    .orderBy(asc(employees.lastName), asc(employees.firstName))
    .limit(params.pageSize)
    .offset(offset(params.page, params.pageSize));

  const roleMap = await rolesByUser(
    db,
    rows.map((r) => r.userId),
  );

  const data: AdminUser[] = rows.map((r) => ({
    userId: r.userId,
    employeeId: r.employeeId,
    displayName: displayName(r.firstName, r.lastName),
    email: r.email,
    jobTitle: r.jobTitle,
    department: r.department,
    status: r.status as AdminUser['status'],
    roles: roleMap.get(r.userId) ?? [],
    mustChangePassword: r.mustChangePassword,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  }));
  return paginate(data, total, params.page, params.pageSize);
}

async function getAdminUserByEmployee(db: Database, employeeId: string): Promise<AdminUser> {
  const [row] = await db
    .select({
      userId: users.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: users.email,
      jobTitle: employees.jobTitle,
      department: employees.department,
      status: employees.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) throw NotFound('User account not found');
  const roleMap = await rolesByUser(db, [row.userId]);
  return {
    userId: row.userId,
    employeeId: row.employeeId,
    displayName: displayName(row.firstName, row.lastName),
    email: row.email,
    jobTitle: row.jobTitle,
    department: row.department,
    status: row.status as AdminUser['status'],
    roles: roleMap.get(row.userId) ?? [],
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

async function userByEmployee(
  db: Database,
  employeeId: string,
): Promise<{ id: string; email: string }> {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (!user) throw NotFound('User account not found for employee');
  return user;
}

async function superAdminCount(db: Database): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(userRoles)
    .where(eq(userRoles.role, 'super_admin'));
  return rows[0]?.value ?? 0;
}

/**
 * Replace a user's roles. Guards against locking the platform out by removing
 * the final super_admin. Records the change in the audit trail.
 */
export async function assignRoles(
  db: Database,
  actorId: string,
  employeeId: string,
  roles: Role[],
): Promise<AdminUser> {
  const user = await userByEmployee(db, employeeId);
  const current = await rolesByUser(db, [user.id]);
  const before = current.get(user.id) ?? [];

  const wasSuperAdmin = before.includes('super_admin');
  const willBeSuperAdmin = roles.includes('super_admin');
  if (wasSuperAdmin && !willBeSuperAdmin && (await superAdminCount(db)) <= 1) {
    throw Conflict('Cannot remove the last super admin');
  }

  const unique = Array.from(new Set(roles));
  // Rewrite the role set atomically so a failure can never strand the user
  // with no roles (schema guarantees at least one role, so the batch is never
  // empty).
  await db.batch([
    db.delete(userRoles).where(eq(userRoles.userId, user.id)),
    ...unique.map((role) =>
      db.insert(userRoles).values({ id: createId('rol'), userId: user.id, role }),
    ),
  ] as Parameters<typeof db.batch>[0]);

  await recordAudit(db, {
    actorId,
    action: 'role.assign',
    entity: 'user',
    entityId: employeeId,
    metadata: { before, after: unique },
  });
  return getAdminUserByEmployee(db, employeeId);
}

/** Change an account's employment status (e.g. deactivate/terminate). */
export async function setUserStatus(
  db: Database,
  actorId: string,
  employeeId: string,
  status: string,
  reason?: string,
): Promise<AdminUser> {
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(status)) {
    throw BadRequest('Invalid status');
  }
  const [emp] = await db
    .select({ id: employees.id, status: employees.status })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) throw NotFound('Employee not found');

  if (actorId === employeeId && status !== 'active') {
    throw BadRequest('You cannot deactivate your own account');
  }

  const isTermination = status === 'terminated';
  await db
    .update(employees)
    .set({
      status,
      terminationDate: isTermination ? nowIso().slice(0, 10) : null,
      updatedAt: nowIso(),
    })
    .where(eq(employees.id, employeeId));

  await recordAudit(db, {
    actorId,
    action: isTermination ? 'user.terminate' : 'user.status_change',
    entity: 'user',
    entityId: employeeId,
    metadata: { from: emp.status, to: status, reason: reason ?? null },
  });
  return getAdminUserByEmployee(db, employeeId);
}

/**
 * Issue a one-time temporary password and force a change at next login. The
 * plaintext password is returned exactly once so an admin can relay it.
 */
export async function resetPassword(
  db: Database,
  actorId: string,
  employeeId: string,
): Promise<{ userId: string; temporaryPassword: string }> {
  const user = await userByEmployee(db, employeeId);
  const temporaryPassword = generateTemporaryPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      updatedAt: nowIso(),
    })
    .where(eq(users.id, user.id));

  await recordAudit(db, {
    actorId,
    action: 'user.password_reset',
    entity: 'user',
    entityId: employeeId,
  });
  return { userId: user.id, temporaryPassword };
}

// ---------------------------------------------------------------------------
// Organization settings
// ---------------------------------------------------------------------------

type OrgSettingsRow = typeof orgSettings.$inferSelect;

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toOrgSettings(row: OrgSettingsRow): OrgSettings {
  return {
    legalName: row.legalName,
    displayName: row.displayName,
    parentCompany: row.parentCompany,
    headquarters: row.headquarters,
    supportEmail: row.supportEmail,
    phone: row.phone,
    website: row.website,
    timezone: row.timezone,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    divisions: parseStringArray(row.divisions),
    locations: parseStringArray(row.locations),
    departments: parseStringArray(row.departments),
    updatedAt: row.updatedAt,
  };
}

/** Distinct, sorted values of a directory column, used to seed org lists. */
async function distinctColumn(db: Database, column: 'division' | 'department' | 'location') {
  const col =
    column === 'division'
      ? employees.division
      : column === 'department'
        ? employees.department
        : employees.location;
  const rows = await db.selectDistinct({ value: col }).from(employees).orderBy(asc(col));
  return rows.map((r) => r.value).filter((v): v is string => Boolean(v));
}

/** Read the singleton org-settings row, lazily creating it with sane defaults. */
export async function getOrgSettings(db: Database): Promise<OrgSettings> {
  const [existing] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, ORG_SETTINGS_ID))
    .limit(1);
  if (existing) return toOrgSettings(existing);

  const [divisions, departments, locations] = await Promise.all([
    distinctColumn(db, 'division'),
    distinctColumn(db, 'department'),
    distinctColumn(db, 'location'),
  ]);
  await db
    .insert(orgSettings)
    .values({
      id: ORG_SETTINGS_ID,
      divisions: JSON.stringify(divisions),
      departments: JSON.stringify(departments),
      locations: JSON.stringify(locations),
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, ORG_SETTINGS_ID))
    .limit(1);
  return toOrgSettings(row!);
}

export async function updateOrgSettings(
  db: Database,
  actorId: string,
  input: UpdateOrgSettingsInput,
): Promise<OrgSettings> {
  await getOrgSettings(db); // ensure the row exists
  const patch: Partial<OrgSettingsRow> = { updatedAt: nowIso() };
  if (input.legalName !== undefined) patch.legalName = input.legalName;
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.parentCompany !== undefined) patch.parentCompany = input.parentCompany;
  if (input.headquarters !== undefined) patch.headquarters = input.headquarters;
  if (input.supportEmail !== undefined) patch.supportEmail = input.supportEmail.toLowerCase();
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.website !== undefined) patch.website = input.website;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.fiscalYearStartMonth !== undefined)
    patch.fiscalYearStartMonth = input.fiscalYearStartMonth;
  if (input.divisions !== undefined)
    patch.divisions = JSON.stringify(Array.from(new Set(input.divisions)));
  if (input.locations !== undefined)
    patch.locations = JSON.stringify(Array.from(new Set(input.locations)));
  if (input.departments !== undefined)
    patch.departments = JSON.stringify(Array.from(new Set(input.departments)));

  await db.update(orgSettings).set(patch).where(eq(orgSettings.id, ORG_SETTINGS_ID));

  await recordAudit(db, {
    actorId,
    action: 'settings.update',
    entity: 'org_settings',
    entityId: ORG_SETTINGS_ID,
    metadata: { fields: Object.keys(input) },
  });
  return getOrgSettings(db);
}

export async function listHolidays(db: Database): Promise<CompanyHoliday[]> {
  const rows = await db.select().from(companyHolidays).orderBy(asc(companyHolidays.date));
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, region: r.region }));
}
