import { z } from 'zod';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from '../enums.js';
import { ROLES } from '../rbac.js';
import { dateString, paginationQuerySchema } from './common.js';

export const addressSchema = z.object({
  line1: z.string().max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().max(120),
  state: z.string().max(120),
  postalCode: z.string().max(20),
  country: z.string().max(120),
});
export type Address = z.infer<typeof addressSchema>;

export const emergencyContactSchema = z.object({
  name: z.string().max(200),
  relationship: z.string().max(120),
  phone: z.string().max(40),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/** Lightweight reference used in lists, org charts and approver fields. */
export const employeeRefSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  jobTitle: z.string(),
  department: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string().email(),
});
export type EmployeeRef = z.infer<typeof employeeRefSchema>;

export const employeeSchema = z.object({
  id: z.string(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  workPhone: z.string().nullable(),
  personalPhone: z.string().nullable(),
  jobTitle: z.string(),
  department: z.string(),
  division: z.string(),
  location: z.string(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(EMPLOYEE_STATUSES),
  managerId: z.string().nullable(),
  hireDate: dateString,
  terminationDate: dateString.nullable(),
  dateOfBirth: dateString.nullable(),
  avatarUrl: z.string().nullable(),
  roles: z.array(z.enum(ROLES)),
  address: addressSchema.nullable(),
  emergencyContact: emergencyContactSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email(),
  workPhone: z.string().max(40).nullable().optional(),
  jobTitle: z.string().min(1).max(160),
  department: z.string().min(1).max(160),
  division: z.string().min(1).max(160),
  location: z.string().min(1).max(160),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  managerId: z.string().nullable().optional(),
  hireDate: dateString,
  roles: z.array(z.enum(ROLES)).min(1).default(['employee']),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .extend({
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    workPhone: z.string().max(40).nullable().optional(),
    personalPhone: z.string().max(40).nullable().optional(),
    address: addressSchema.nullable().optional(),
    emergencyContact: emergencyContactSchema.nullable().optional(),
    terminationDate: dateString.nullable().optional(),
  });
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** A node in the org chart, with direct reports nested. */
export interface OrgNode extends EmployeeRef {
  managerId: string | null;
  status: z.infer<typeof employeeSchema>['status'];
  location: string;
  reports: OrgNode[];
}

/** Columns the directory may be ordered by. */
export const EMPLOYEE_SORT_FIELDS = [
  'name',
  'jobTitle',
  'department',
  'division',
  'location',
  'status',
  'hireDate',
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Query parameters accepted by the directory listing endpoint. */
export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  department: z.string().trim().max(160).optional(),
  division: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  managerId: z.string().trim().max(80).optional(),
  sort: z.enum(EMPLOYEE_SORT_FIELDS).default('name'),
  sortDir: z.enum(SORT_DIRECTIONS).default('asc'),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

/** Terminate or deactivate an employee, recording an effective date. */
export const terminateEmployeeSchema = z.object({
  status: z.enum(['terminated', 'on_leave']).default('terminated'),
  terminationDate: dateString,
  reason: z.string().trim().max(500).optional(),
});
export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;
