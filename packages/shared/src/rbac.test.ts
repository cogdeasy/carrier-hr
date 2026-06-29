import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsForRole, permissionsForRoles } from './rbac.js';

describe('rbac', () => {
  it('grants employees access to their own profile but not write-all', () => {
    expect(hasPermission(['employee'], 'employee:write:own')).toBe(true);
    expect(hasPermission(['employee'], 'employee:write')).toBe(false);
  });

  it('grants managers team-level time off approval', () => {
    expect(hasPermission(['manager'], 'timeoff:approve')).toBe(true);
    expect(hasPermission(['manager'], 'timeoff:admin')).toBe(false);
  });

  it('grants hr_admin full administrative permissions', () => {
    expect(hasPermission(['hr_admin'], 'payroll:admin')).toBe(true);
    expect(hasPermission(['hr_admin'], 'settings:admin')).toBe(true);
  });

  it('super_admin holds every permission', () => {
    expect(permissionsForRole('super_admin').length).toBeGreaterThan(0);
    expect(hasPermission(['super_admin'], 'audit:read')).toBe(true);
  });

  it('merges permissions across multiple roles without duplicates', () => {
    const merged = permissionsForRoles(['employee', 'manager']);
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged).toContain('timeoff:approve');
  });
});
