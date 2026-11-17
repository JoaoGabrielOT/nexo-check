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
