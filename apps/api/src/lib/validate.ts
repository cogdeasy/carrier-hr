import type { z } from 'zod';
import { BadRequest } from './errors.js';

/** Parse and validate input with a Zod schema, throwing a 400 on failure. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw BadRequest('Validation failed', result.error.flatten());
  }
  return result.data;
}
