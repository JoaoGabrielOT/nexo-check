import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PrismaClient } from './db';
import type { Env } from './env';
import { registerAdminJwt } from './plugins/admin-auth';
import { adminRoutes } from './routes/admin';
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
  /** Limite de registros por IP por hora em POST /v1/participants (padrão 60). */
  registerLimitMax?: number;
  /** Limite de tentativas de login admin por IP a cada 15 minutos (padrão 5). */
  loginLimitMax?: number;
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

  const clientIpHeader = env.CLIENT_IP_HEADER;

  // Diagnóstico para escolher CLIENT_IP_HEADER em produção: só presença e contagem, nunca valores.
  // O health check e a sondagem de boot do Render (HEAD / sem X-Forwarded-For) não passam pelo
  // proxy. O endereço do socket não serve: no Render o tráfego real também chega via loopback.
  let ipHeadersLogged = false;
  app.addHook('onRequest', async (req) => {
    if (ipHeadersLogged || req.url.split('?')[0] === '/health') return;
    if (!('x-forwarded-for' in req.headers)) return;
    ipHeadersLogged = true;
    const xff = req.headers['x-forwarded-for'];
    const xffValue = Array.isArray(xff) ? xff.join(',') : xff;
    req.log.info(
      {
        cfConnectingIp: 'cf-connecting-ip' in req.headers,
        trueClientIp: 'true-client-ip' in req.headers,
        xRealIp: 'x-real-ip' in req.headers,
        xForwardedForCount: xffValue ? xffValue.split(',').length : 0,
      },
      'ip_headers',
    );
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
    // O padrão do @fastify/cors (v10+) é só GET,HEAD,POST: sem isto o navegador bloqueia
    // o PATCH do consentimento e o DELETE de apagar dados (LGPD) e de sessões no admin.
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    // O painel admin lê o nome do CSV neste cabeçalho (origem diferente da API).
    exposedHeaders: ['content-disposition'],
    // O navegador reaproveita o preflight por 2 h (padrão do Chrome: 5 s sem isto).
    maxAge: 7200,
  });
  await app.register(rateLimit, {
    global: true,
    max: opts.rateLimitMax ?? 100,
    timeWindow: '1 minute',
    // Atrás de Cloudflare + Render, req.ip é o IP de saída do proxy (vários clientes na mesma
    // chave). O cabeçalho configurado traz o IP real; vale também para os limites por rota.
    keyGenerator: (req) => {
      if (clientIpHeader) {
        const raw = req.headers[clientIpHeader];
        const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
        if (first) return first;
      }
      return req.ip;
    },
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
    registerLimitMax: opts.registerLimitMax ?? 60,
  });
  await app.register(syncRoutes, { prefix: '/v1', prisma });
  await app.register(questionnaireRoutes, { prefix: '/v1', prisma });
  await app.register(checkinRoutes, { prefix: '/v1', prisma });
  await registerAdminJwt(app, env.ADMIN_JWT_SECRET);
  await app.register(adminRoutes, {
    prefix: '/v1',
    prisma,
    env,
    loginLimitMax: opts.loginLimitMax ?? 5,
  });
  // Demais rotas de negócio entram em `/v1` nas próximas tarefas.

  return app;
}
