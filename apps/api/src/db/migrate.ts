import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getClient, getDb } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_FOLDER = resolve(here, '../../drizzle');

export async function runMigrations(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

// Allow running directly: `tsx src/db/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied.');
      getClient().close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
