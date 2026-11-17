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
      $queryRaw: () => Promise.reject(new Error('conex�o recusada')),
    } as unknown as PrismaClient;
    const app = await buildApp({ prisma: broken, env: testEnv });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'error' });
    await app.close();
  });
});
