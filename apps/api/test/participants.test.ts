import { generateRecoveryKey } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { PrismaClient } from '../src/db';
import { requireParticipant } from '../src/plugins/participant-auth';
import { makeTestApp, testEnv } from './helpers';

const CODE = 'NEXO-AB23';
const KEY = generateRecoveryKey();

// IP novo por chamada: o limite de 60/h por IP é compartilhado entre os testes do arquivo.
let nextIp = 0;
const register = (app: FastifyInstance, payload: object, ip = `203.0.113.${++nextIp}`) =>
  app.inject({
    method: 'POST',
    url: '/v1/participants',
    headers: { 'x-forwarded-for': ip },
    payload,
  });
const authHeaders = (code = CODE, key = KEY) => ({
  'x-participant-code': code,
  'x-participant-key': key,
});

describe('participantes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, prisma, reset } = await makeTestApp());
    app.get('/v1/_me', { preHandler: requireParticipant(prisma) }, async (req) => req.participant);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await reset();
  });

  it('registra o participante guardando só o hash scrypt da chave', async () => {
    const res = await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ code: CODE });
    const row = await prisma.participant.findUniqueOrThrow({ where: { code: CODE } });
    expect(row.consentVersion).toBe(1);
    expect(row.keyHash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(row.keyHash).not.toContain(KEY);
  });

  it('normaliza o código recebido (minúsculas, sem prefixo, O→0)', async () => {
    const res = await register(app, { code: 'ab23', key: KEY, consentVersion: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ code: CODE });
  });

  it('código repetido devolve 409 code_taken', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const res = await register(app, {
      code: CODE,
      key: generateRecoveryKey(),
      consentVersion: 1,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'code_taken' });
  });

  it('rejeita código inválido, versão de consentimento fora do intervalo e corpo incompleto', async () => {
    for (const body of [
      { code: 'XYZ', key: KEY, consentVersion: 1 },
      { code: CODE, key: KEY, consentVersion: 0 },
      { code: CODE, key: KEY, consentVersion: 2 },
      { code: CODE, key: '', consentVersion: 1 },
      { code: CODE, key: 'a', consentVersion: 1 },
      { code: CODE, key: `${KEY}A`, consentVersion: 1 },
      { code: CODE, key: `${KEY.slice(0, 23)}U`, consentVersion: 1 },
      { code: CODE },
    ]) {
      const res = await register(app, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_request' });
    }
    expect(await prisma.participant.count()).toBe(0);
  });

  it('chave em minúsculas é normalizada no registro e na autenticação', async () => {
    const res = await register(app, {
      code: CODE,
      key: ` ${KEY.toLowerCase()} `,
      consentVersion: 1,
    });
    expect(res.statusCode).toBe(201);
    for (const key of [KEY, KEY.toLowerCase()]) {
      const me = await app.inject({
        method: 'GET',
        url: '/v1/_me',
        headers: authHeaders(CODE, key),
      });
      expect(me.statusCode).toBe(200);
    }
  });

  it('hash armazenado malformado dá 401, não 500', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    for (const keyHash of ['lixo', 'scrypt$x$y$z$a$b', 'scrypt$3$8$1$AAAA$AAAA']) {
      await prisma.participant.update({ where: { code: CODE }, data: { keyHash } });
      const res = await app.inject({ method: 'GET', url: '/v1/_me', headers: authHeaders() });
      expect(res.statusCode).toBe(401);
    }
  });

  it('registros concorrentes do mesmo código: um 201 e um 409', async () => {
    const results = await Promise.all([
      register(app, { code: CODE, key: KEY, consentVersion: 1 }),
      register(app, { code: CODE, key: KEY, consentVersion: 1 }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });

  it('segundo DELETE com as mesmas credenciais dá 401', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const del = () =>
      app.inject({ method: 'DELETE', url: '/v1/participants/me', headers: authHeaders() });
    expect((await del()).statusCode).toBe(204);
    expect((await del()).statusCode).toBe(401);
  });

  it('autentica com código e chave certos', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const res = await app.inject({ method: 'GET', url: '/v1/_me', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ code: CODE, id: expect.any(String) });
  });

  it('aceita o código em formato não normalizado no cabeçalho', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/_me',
      headers: authHeaders(' nexo-ab23 '),
    });
    expect(res.statusCode).toBe(200);
  });

  it('chave errada, código inexistente e cabeçalhos ausentes dão o mesmo 401', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const bodies = [];
    for (const headers of [
      authHeaders(CODE, 'chave-errada'),
      authHeaders('NEXO-ZZ99', KEY),
      {},
      { 'x-participant-code': CODE },
    ]) {
      const res = await app.inject({ method: 'GET', url: '/v1/_me', headers });
      expect(res.statusCode).toBe(401);
      bodies.push(res.json());
    }
    for (const b of bodies) {
      expect(b).toEqual({ error: 'unauthorized', message: expect.any(String) });
      expect(b).toEqual(bodies[0]);
    }
  });

  it('DELETE /me apaga o participante e tudo em cascata', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const p = await prisma.participant.findUniqueOrThrow({ where: { code: CODE } });
    const session = await prisma.workshopSession.create({
      data: {
        workshop: 1,
        date: new Date(),
        location: 'Sala 1',
        code: 'ABC234',
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.syncRecord.create({
      data: {
        participantId: p.id,
        entity: 'habit',
        entityId: 'h1',
        payload: {},
        updatedAt: new Date(),
      },
    });
    await prisma.questionnaireResponse.create({
      data: {
        participantId: p.id,
        clientId: 'q1',
        kind: 'educational',
        version: 1,
        answers: {},
        score: 5,
        submittedAt: new Date(),
      },
    });
    await prisma.checkin.create({ data: { participantId: p.id, sessionId: session.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/participants/me',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.participant.count()).toBe(0);
    expect(await prisma.syncRecord.count()).toBe(0);
    expect(await prisma.questionnaireResponse.count()).toBe(0);
    expect(await prisma.checkin.count()).toBe(0);
    expect(await prisma.workshopSession.count()).toBe(1);
  });

  it('DELETE /me sem credenciais válidas dá 401 e não apaga nada', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/participants/me',
      headers: authHeaders(CODE, 'errada'),
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.participant.count()).toBe(1);
  });

  it('PATCH /me/consent atualiza versão e data', async () => {
    await register(app, { code: CODE, key: KEY, consentVersion: 1 });
    const before = await prisma.participant.findUniqueOrThrow({ where: { code: CODE } });
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/participants/me/consent',
      headers: authHeaders(),
      payload: { consentVersion: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ consentVersion: number; consentAt: string }>();
    expect(body.consentVersion).toBe(1);
    expect(new Date(body.consentAt).getTime()).toBeGreaterThanOrEqual(before.consentAt.getTime());
    const bad = await app.inject({
      method: 'PATCH',
      url: '/v1/participants/me/consent',
      headers: authHeaders(),
      payload: { consentVersion: 99 },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('o 61º registro na mesma hora, do mesmo IP, dá 429', async () => {
    const digits = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < 60; i++) {
      const code = `NEXO-AB${digits[Math.floor(i / 10)]}${digits[i % 10]}`;
      const res = await register(app, { code, key: KEY, consentVersion: 1 }, '198.51.100.7');
      expect(res.statusCode).toBe(201);
    }
    const res = await register(
      app,
      { code: 'NEXO-ZZZZ', key: KEY, consentVersion: 1 },
      '198.51.100.7',
    );
    expect(res.statusCode).toBe(429);
    const other = await register(
      app,
      { code: 'NEXO-ZZZY', key: KEY, consentVersion: 1 },
      '198.51.100.8',
    );
    expect(other.statusCode).toBe(201);
  });
});

describe('logs', () => {
  it('não registra a chave do participante', async () => {
    const lines: string[] = [];
    const app = await buildApp({
      prisma: { $disconnect: () => Promise.resolve() } as unknown as PrismaClient,
      env: { ...testEnv, NODE_ENV: 'development' },
      logStream: { write: (s: string) => void lines.push(s) },
    });
    app.get('/_log', async (req) => {
      req.log.info({ headers: req.headers }, 'chegou');
      return {};
    });
    await app.inject({ method: 'GET', url: '/_log', headers: authHeaders(CODE, 'SEGREDO-NO-LOG') });
    await app.close();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('')).not.toContain('SEGREDO-NO-LOG');
  });
});
