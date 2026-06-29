import { z } from 'zod';
import { ROLES } from '../rbac.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
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
