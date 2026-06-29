import type { Paginated } from '@carrier-hr/shared';

export function paginate<T>(rows: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    data: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function offset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
