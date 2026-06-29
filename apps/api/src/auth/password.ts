import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/**
 * Generates a unique, high-entropy temporary password for a freshly provisioned
 * account. The `Aa1` prefix guarantees the value satisfies the strong-password
 * policy (upper/lower/digit); the random suffix supplies the entropy. The
 * holder is forced to rotate it on first sign-in (`mustChangePassword`).
 */
export function generateTemporaryPassword(): string {
  const random = randomBytes(15).toString('base64url').slice(0, 18);
  return `Aa1${random}`;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
