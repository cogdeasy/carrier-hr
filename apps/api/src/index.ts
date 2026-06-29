import { buildApp } from './app.js';
import { getEnv } from './env.js';

async function main(): Promise<void> {
  const env = getEnv();
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Collins Aerospace HR API listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
