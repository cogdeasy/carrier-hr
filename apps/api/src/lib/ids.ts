import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 20);

/** Generate a prefixed, URL-safe identifier, e.g. `emp_3k9...`. */
export function createId(prefix: string): string {
  return `${prefix}_${nano()}`;
}
