import { z } from 'zod';

/** ISO date string (YYYY-MM-DD). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected YYYY-MM-DD date');

/** ISO datetime string. */
export const dateTimeString = z.string().datetime({ offset: true });

export const idSchema = z.string().min(1);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const moneySchema = z.object({
  amountCents: z.number().int(),
  currency: z.string().length(3).default('USD'),
});
export type Money = z.infer<typeof moneySchema>;
