import { buildApp } from './app';
import { createPrisma } from './db';
import { parseEnv } from './env';

const env = parseEnv();
const prisma = createPrisma(env.DATABASE_URL);
const app = await buildApp({ prisma, env });

// Fechar o app também desconecta o Prisma (hook onClose em buildApp).
let closing = false;
const shutdown = async (code: number) => {
  if (closing) return;
  closing = true;
  try {
    await app.close();
  } catch (err) {
    console.error(err);
    code = 1;
  }
  process.exit(code);
};
process.once('SIGTERM', () => void shutdown(0));
process.once('SIGINT', () => void shutdown(0));

try {
  await app.listen({ host: '0.0.0.0', port: env.PORT });
} catch (err) {
  app.log.error(err);
  await shutdown(1);
}
