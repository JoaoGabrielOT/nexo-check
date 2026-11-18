import { generateRecoveryKey } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/db';
import { hashKey } from '../src/plugins/participant-auth';
import { makeTestApp } from './helpers';

const KEY = generateRecoveryKey();
const headers = { 'x-participant-code': 'NEXO-AB23', 'x-participant-key': KEY };
const HOUR = 3_600_000;

describe('POST /v1/checkins', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let reset: () => Promise<void>;

  const post = (payload: object, h: Record<string, string> = headers) =>
    app.inject({ method: 'POST', url: '/v1/checkins', headers: h, payload });
  const seed = (code: string, expiresAt: Date) =>
    prisma.workshopSession.create({
      data: {
        workshop: 2,
        date: new Date('2026-11-20T00:00:00.000Z'),
        location: 'Sala 1',
        code,
        expiresAt,
      },
    });

  beforeAll(async () => {
    ({ app, prisma, reset } = await makeTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await reset();
    await prisma.participant.create({
      data: {
        code: 'NEXO-AB23',
        keyHash: await hashKey(KEY),
        consentAt: new Date(),
        consentVersion: 1,
      },
    });
  });

  it('exige autenticação', async () => {
    await seed('ABC234', new Date(Date.now() + HOUR));
    expect((await post({ sessionCode: 'ABC234', clientId: 'c1' }, {})).statusCode).toBe(401);
  });

  it('check-in válido devolve 201 e o repetido 200 com o mesmo corpo', async () => {
    await seed('ABC234', new Date(Date.now() + HOUR));
    const first = await post({ sessionCode: ' abc234 ', clientId: 'c1' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: 'confirmed', workshop: 2, date: '2026-11-20' });
    const again = await post({ sessionCode: 'ABC234', clientId: 'c2' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect(await prisma.checkin.count()).toBe(1);
  });

  it('repetir depois de expirar continua devolvendo 200', async () => {
    const s = await seed('ABC234', new Date(Date.now() + HOUR));
    expect((await post({ sessionCode: 'ABC234', clientId: 'c1' })).statusCode).toBe(201);
    await prisma.workshopSession.update({
      where: { id: s.id },
      data: { expiresAt: new Date(Date.now() - HOUR) },
    });
    expect((await post({ sessionCode: 'ABC234', clientId: 'c1' })).statusCode).toBe(200);
  });

  it('check-ins simultâneos geram uma linha', async () => {
    await seed('ABC234', new Date(Date.now() + HOUR));
    const rs = await Promise.all(
      [1, 2, 3].map((n) => post({ sessionCode: 'ABC234', clientId: `c${n}` })),
    );
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(await prisma.checkin.count()).toBe(1);
  });

  it('código inexistente devolve 404 invalid_code', async () => {
    const res = await post({ sessionCode: 'ZZZZZZ', clientId: 'c1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('invalid_code');
  });

  it('sessão expirada devolve 410 expired e não registra', async () => {
    await seed('ABC234', new Date(Date.now() - HOUR));
    const res = await post({ sessionCode: 'ABC234', clientId: 'c1' });
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toBe('expired');
    expect(await prisma.checkin.count()).toBe(0);
  });

  it('código com formato inválido devolve 400', async () => {
    expect((await post({ sessionCode: 'abc', clientId: 'c1' })).statusCode).toBe(400);
  });
});
