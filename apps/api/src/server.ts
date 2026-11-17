import { buildApp } from './app';
import { createPrisma } from './db';
import { parseEnv } from './env';

const env = parseEnv();
const prisma = createPrisma(env.DATABASE_URL);
const app = await buildApp({ prisma, env });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

try {
  await app.listen({ host: '0.0.0.0', port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
