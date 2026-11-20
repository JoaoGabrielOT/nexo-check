import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { PrismaClient } from '../src/db';
import { makeTestApp, testEnv } from './helpers';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await makeTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde ok com o banco acessível', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; version: string; db: string }>();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(typeof body.version).toBe('string');
  });

  it('envia cabeçalhos de segurança do helmet', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('não libera CORS para origem desconhecida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://malicioso.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('libera CORS para origem configurada e para o Tauri', async () => {
    for (const origin of ['https://nexo.example', 'tauri://localhost']) {
      const res = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('libera no preflight os métodos que o app usa (PATCH e DELETE)', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/participants/me',
        headers: {
          origin: 'https://nexo.example',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization',
        },
      });
      expect(res.statusCode).toBe(204);
      expect(String(res.headers['access-control-allow-methods'])).toContain(method);
      expect(res.headers['access-control-max-age']).toBe('7200');
    }
  });

  it('devolve erro padronizado para rota inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: expect.any(String) });
  });
});

describe('GET /health com o banco fora do ar', () => {
  it('continua respondendo 200 com db: error', async () => {
    const broken = {
      $queryRaw: () => Promise.reject(new Error('conexão recusada')),
      $disconnect: () => Promise.resolve(),
    } as unknown as PrismaClient;
    const app = await buildApp({ prisma: broken, env: testEnv });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'error' });
    await app.close();
  });
});

describe('rate limit e CORS normalizado', () => {
  it('limita por IP do cliente (X-Forwarded-For), não pelo proxy', async () => {
    const { app } = await makeTestApp({}, 3);
    const get = (ip: string) =>
      app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': ip } });
    for (let i = 0; i < 3; i++) expect((await get('203.0.113.1')).statusCode).toBe(200);
    expect((await get('203.0.113.1')).statusCode).toBe(429);
    expect((await get('203.0.113.2')).statusCode).toBe(200);
    await app.close();
  });

  it('não deixa o cliente forjar o IP com X-Forwarded-For à esquerda', async () => {
    const { app } = await makeTestApp({}, 3);
    const get = (n: number) =>
      app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-forwarded-for': `198.51.100.${n}, 203.0.113.1` },
      });
    for (let i = 1; i <= 3; i++) expect((await get(i)).statusCode).toBe(200);
    expect((await get(4)).statusCode).toBe(429);
    await app.close();
  });

  it('com CLIENT_IP_HEADER, limita pelo cabeçalho e não pelo IP do proxy', async () => {
    const { app } = await makeTestApp({ CLIENT_IP_HEADER: 'cf-connecting-ip' }, 2);
    const get = (client: string, proxy: string) =>
      app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'cf-connecting-ip': client, 'x-forwarded-for': proxy },
      });
    // Mesmo cliente passando por IPs de proxy diferentes: uma única chave.
    expect((await get('203.0.113.1', '10.0.0.1')).statusCode).toBe(200);
    expect((await get('203.0.113.1', '10.0.0.2')).statusCode).toBe(200);
    expect((await get('203.0.113.1', '10.0.0.3')).statusCode).toBe(429);
    // Outro cliente atrás do mesmo proxy tem a própria cota.
    expect((await get('203.0.113.2', '10.0.0.3')).statusCode).toBe(200);
    await app.close();
  });

  it('com CLIENT_IP_HEADER definido mas ausente na requisição, cai para req.ip', async () => {
    const { app } = await makeTestApp({ CLIENT_IP_HEADER: 'cf-connecting-ip' }, 2);
    const get = () =>
      app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(429);
    await app.close();
  });

  it('registra uma vez só a presença dos cabeçalhos de IP, sem os valores', async () => {
    const lines: string[] = [];
    const app = await buildApp({
      prisma: { $disconnect: () => Promise.resolve() } as unknown as PrismaClient,
      env: { ...testEnv, NODE_ENV: 'development' },
      logStream: { write: (s: string) => void lines.push(s) },
    });
    const headers = {
      'cf-connecting-ip': '198.51.100.77',
      'x-forwarded-for': '203.0.113.5, 10.1.1.1',
    };
    // O health check e a sondagem de boot do Render (HEAD / sem X-Forwarded-For) não passam
    // pelo proxy: não servem de amostra. No Render o tráfego real também chega via loopback
    // (proxy local), então o endereço do socket não distingue.
    await app.inject({ method: 'GET', url: '/health', headers });
    await app.inject({ method: 'HEAD', url: '/' });
    await app.inject({ method: 'GET', url: '/nada', headers: { 'cf-connecting-ip': '1.2.3.4' } });
    await app.inject({ method: 'GET', url: '/nada', headers });
    await app.inject({ method: 'GET', url: '/nada', headers });
    await app.close();
    const diag = lines.filter((l) => l.includes('ip_headers'));
    expect(diag).toHaveLength(1);
    const entry = JSON.parse(diag[0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({
      cfConnectingIp: true,
      trueClientIp: false,
      xRealIp: false,
      xForwardedForCount: 2,
    });
    expect(lines.join('')).not.toContain('198.51.100.77');
    expect(lines.join('')).not.toContain('203.0.113.5');
  });

  it('ignora barra final e espaços nas origens configuradas', async () => {
    const { parseEnv } = await import('../src/env');
    const env = parseEnv({
      DATABASE_URL: 'x',
      ADMIN_PASSWORD: 'senha-segura-123',
      ADMIN_JWT_SECRET: 'x'.repeat(32),
      PUBLIC_WEB_URL: 'https://nexo.example',
      CORS_ORIGINS: ' https://nexo.example/ ',
      NODE_ENV: 'test',
    });
    const { app } = await makeTestApp({ CORS_ORIGINS: env.CORS_ORIGINS });
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://nexo.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://nexo.example');
    await app.close();
  });

  it('erro de validação Zod vira 400 invalid_request', async () => {
    const { z } = await import('zod');
    const app = await buildApp({
      prisma: { $disconnect: () => Promise.resolve() } as unknown as PrismaClient,
      env: testEnv,
    });
    app.post('/_t', async (req) => z.object({ n: z.number() }).parse(req.body));
    const res = await app.inject({ method: 'POST', url: '/_t', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request', message: expect.any(String) });
    await app.close();
  });
});
