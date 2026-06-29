import { z } from 'zod';
import { ROLES } from '../rbac.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Strong-password policy: 8-128 chars with at least one lowercase letter, one
 * uppercase letter, and one digit. Shared so the API and web client validate
 * identically.
 */
export const strongPassword = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[0-9]/, 'Must include a number');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  roles: z.array(z.enum(ROLES)),
  employeeId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
  user: authUserSchema,
  permissions: z.array(z.string()),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const sessionSchema = z.object({
  user: authUserSchema,
  permissions: z.array(z.string()),
});
export type Session = z.infer<typeof sessionSchema>;
