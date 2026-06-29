import { z } from 'zod';
import { EMPLOYEE_STATUSES } from '../enums.js';
import { ROLES } from '../rbac.js';
import { paginationQuerySchema } from './common.js';

/** A user account surfaced in the admin user/role management table. */
export const adminUserSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  jobTitle: z.string(),
  department: z.string(),
  status: z.enum(EMPLOYEE_STATUSES),
  roles: z.array(z.enum(ROLES)),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserQuerySchema = paginationQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const assignRolesSchema = z.object({
  roles: z.array(z.enum(ROLES)).min(1, 'At least one role is required'),
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(EMPLOYEE_STATUSES),
  reason: z.string().trim().max(500).optional(),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

/** Result of an admin-initiated password reset; the temp password is shown once. */
export const passwordResetResultSchema = z.object({
  userId: z.string(),
  temporaryPassword: z.string(),
});
export type PasswordResetResult = z.infer<typeof passwordResetResultSchema>;

// ---------------------------------------------------------------------------
// Organization settings
// ---------------------------------------------------------------------------

export const orgSettingsSchema = z.object({
  legalName: z.string(),
  displayName: z.string(),
  parentCompany: z.string(),
  headquarters: z.string(),
  supportEmail: z.string().email(),
  phone: z.string().nullable(),
  website: z.string(),
  timezone: z.string(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  divisions: z.array(z.string()),
  locations: z.array(z.string()),
  departments: z.array(z.string()),
  updatedAt: z.string(),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const updateOrgSettingsSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
    parentCompany: z.string().trim().min(1).max(200),
    headquarters: z.string().trim().min(1).max(200),
    supportEmail: z.string().email().max(200),
    phone: z.string().trim().max(40).nullable(),
    website: z.string().trim().url().max(300),
    timezone: z.string().trim().min(1).max(80),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    divisions: z.array(z.string().trim().min(1).max(160)).max(100),
    locations: z.array(z.string().trim().min(1).max(160)).max(500),
    departments: z.array(z.string().trim().min(1).max(160)).max(200),
  })
  .partial();
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLogSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(120).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
