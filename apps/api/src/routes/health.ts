import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../db';

const DB_TIMEOUT_MS = 2000;

async function pingDb(prisma: PrismaClient): Promise<'ok' | 'error'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

// Responde sempre 200: o health check do Render deve refletir o processo, não derrubar
// o serviço (e reiniciá-lo em loop) por uma queda passageira do banco. O estado do banco
// vai no campo `db`.
export async function healthRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; version: string },
): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok' as const,
    version: opts.version,
    db: await pingDb(opts.prisma),
  }));
}
