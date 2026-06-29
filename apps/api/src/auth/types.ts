import type { Permission, Role } from '@carrier-hr/shared';

/** Decoded JWT payload stored in the signed token. */
export interface JwtPayload {
  sub: string;
  employeeId: string;
  email: string;
  roles: Role[];
}

/** Authenticated principal attached to each authorized request. */
export interface AuthPrincipal {
  userId: string;
  employeeId: string;
  email: string;
  roles: Role[];
  permissions: Permission[];
}
