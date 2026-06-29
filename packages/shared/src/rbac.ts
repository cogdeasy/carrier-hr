/**
 * Role-based access control definitions shared by the API and web client.
 *
 * Roles are hierarchical in spirit but permissions are enumerated explicitly so
 * that authorization checks remain auditable and predictable.
 */

export const ROLES = ['employee', 'manager', 'recruiter', 'hr_admin', 'executive', 'super_admin'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  employee: 'Employee',
  manager: 'Manager',
  recruiter: 'Recruiter',
  hr_admin: 'HR Admin',
  executive: 'Executive',
  super_admin: 'Super Admin',
};

/**
 * Fine-grained permissions. The string format is `<resource>:<action>` where
 * action is one of read | write | approve | admin and a trailing `:own`/`:team`
 * scope narrows the records the permission applies to.
 */
export const PERMISSIONS = [
  // Directory & profiles
  'employee:read',
  'employee:read:team',
  'employee:read:own',
  'employee:write',
  'employee:write:own',
  // Org structure
  'org:read',
  'org:write',
  // Time off
  'timeoff:read',
  'timeoff:read:team',
  'timeoff:read:own',
  'timeoff:request',
  'timeoff:approve',
  'timeoff:admin',
  // Timesheets / attendance
  'timesheet:read:own',
  'timesheet:read:team',
  'timesheet:submit',
  'timesheet:approve',
  // Payroll
  'payroll:read:own',
  'payroll:read',
  'payroll:admin',
  // Benefits
  'benefits:read:own',
  'benefits:enroll',
  'benefits:admin',
  // Performance
  'performance:read:own',
  'performance:read:team',
  'performance:write:own',
  'performance:review',
  'performance:admin',
  // Recruitment
  'recruiting:read',
  'recruiting:write',
  'recruiting:admin',
  // Onboarding
  'onboarding:read:own',
  'onboarding:read',
  'onboarding:admin',
  // Learning
  'learning:read:own',
  'learning:read:team',
  'learning:enroll',
  'learning:assign',
  'learning:admin',
  // Documents
  'document:read:own',
  'document:read',
  'document:admin',
  // Analytics
  'analytics:read:team',
  'analytics:read',
  // Platform administration
  'settings:admin',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  'employee:read',
  'employee:read:own',
  'employee:write:own',
  'org:read',
  'timeoff:read:own',
  'timeoff:request',
  'timesheet:read:own',
  'timesheet:submit',
  'payroll:read:own',
  'benefits:read:own',
  'benefits:enroll',
  'performance:read:own',
  'performance:write:own',
  'onboarding:read:own',
  'learning:read:own',
  'learning:enroll',
  'document:read:own',
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  'employee:read:team',
  'timeoff:read:team',
  'timeoff:approve',
  'timesheet:read:team',
  'timesheet:approve',
  'performance:read:team',
  'performance:review',
  'analytics:read:team',
  'learning:read:team',
  'learning:assign',
  'recruiting:read',
];

const RECRUITER_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  'recruiting:read',
  'recruiting:write',
  'onboarding:read',
];

const HR_ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  ...RECRUITER_PERMISSIONS,
  'employee:read',
  'employee:write',
  'org:write',
  'timeoff:read',
  'timeoff:admin',
  'payroll:read',
  'payroll:admin',
  'benefits:admin',
  'performance:admin',
  'recruiting:admin',
  'onboarding:admin',
  'learning:admin',
  'document:read',
  'document:admin',
  'analytics:read',
  'settings:admin',
  'audit:read',
];

const EXECUTIVE_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  'employee:read',
  'org:read',
  'analytics:read',
  'performance:read:team',
  'document:read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  employee: EMPLOYEE_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  recruiter: RECRUITER_PERMISSIONS,
  hr_admin: HR_ADMIN_PERMISSIONS,
  executive: EXECUTIVE_PERMISSIONS,
  super_admin: [...PERMISSIONS],
};

/** Returns the de-duplicated set of permissions granted to a role. */
export function permissionsForRole(role: Role): Permission[] {
  return Array.from(new Set(ROLE_PERMISSIONS[role] ?? []));
}

/** Returns the merged, de-duplicated permissions for a set of roles. */
export function permissionsForRoles(roles: Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const perm of permissionsForRole(role)) set.add(perm);
  }
  return Array.from(set);
}

/** True when any of the supplied roles grants the requested permission. */
export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((role) => permissionsForRole(role).includes(permission));
}
