import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PrismaClient } from './db';
import type { Env } from './env';
import { healthRoutes } from './routes/health';
import { checkinRoutes } from './routes/checkins';
import { participantRoutes } from './routes/participants';
import { questionnaireRoutes } from './routes/questionnaires';
import { syncRoutes } from './routes/sync';

declare const __APP_VERSION__: string | undefined;

const TAURI_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

export interface BuildAppOptions {
  prisma: PrismaClient;
  env: Env;
  /** Limite global por IP por minuto (padrão 100); testes podem reduzir. */
  rateLimitMax?: number;
  /** Limite de registros por IP por hora em POST /v1/participants (padrão 10). */
  registerLimitMax?: number;
  /** Destino dos logs (testes); com ele o logger fica ligado mesmo em NODE_ENV=test. */
  logStream?: { write(msg: string): void };
}

function appVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined') return __APP_VERSION__;
  return process.env.npm_package_version ?? '0.0.0';
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { prisma, env } = opts;
  const app = Fastify({
    // Confia só nos N últimos saltos de X-Forwarded-For (o proxy do Render acrescenta o IP real
    // à direita). `true` usaria a entrada mais à esquerda, forjável pelo cliente.
    trustProxy: (_addr: string, hop: number) => hop < env.TRUST_PROXY_HOPS,
    logger:
      env.NODE_ENV === 'test' && !opts.logStream
        ? false
        : {
            level: 'info',
            // A chave de recuperação nunca pode ir para o log.
            redact: ['req.headers["x-participant-key"]', 'headers["x-participant-key"]'],
            ...(opts.logStream ? { stream: opts.logStream } : {}),
          },
  });

  const origins = new Set([
    ...env.CORS_ORIGINS,
    ...TAURI_ORIGINS,
    ...(env.NODE_ENV === 'development' ? ['http://localhost:5173'] : []),
  ]);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, origin === undefined || origins.has(origin)),
  });
  await app.register(rateLimit, {
    global: true,
    max: opts.rateLimitMax ?? 100,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: 'invalid_request', message: err.issues.map((i) => i.message).join('; ') });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
    if (status >= 500) {
      app.log.error(err);
      return reply
        .status(500)
        .send({ error: 'internal_error', message: 'Erro interno do servidor.' });
    }
    return reply.status(status).send({
      error: (e.code ?? 'request_error').toLowerCase(),
      message: e.message ?? 'Requisição inválida.',
    });
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: 'not_found', message: 'Rota não encontrada.' }),
  );

  await app.register(healthRoutes, { prisma, version: appVersion() });
  await app.register(participantRoutes, {
    prefix: '/v1',
    prisma,
    registerLimitMax: opts.registerLimitMax ?? 10,
  });
  await app.register(syncRoutes, { prefix: '/v1', prisma });
  await app.register(questionnaireRoutes, { prefix: '/v1', prisma });
  await app.register(checkinRoutes, { prefix: '/v1', prisma });
  // Demais rotas de negócio entram em `/v1` nas próximas tarefas.

  return app;
}
