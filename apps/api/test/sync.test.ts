import {
  generateRecoveryKey,
  MAX_CLOCK_SKEW_MS,
  syncEntityName,
  syncPushRequest,
} from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/db';
import { syncPushSchema } from '../src/routes/sync';
import { hashKey } from '../src/plugins/participant-auth';
import { makeTestApp } from './helpers';

const KEY_A = generateRecoveryKey();
const KEY_B = generateRecoveryKey();
const headersA = { 'x-participant-code': 'NEXO-AB23', 'x-participant-key': KEY_A };
const headersB = { 'x-participant-code': 'NEXO-CD45', 'x-participant-key': KEY_B };

const T0 = '2026-11-10T10:00:00.000Z';
const T1 = '2026-11-10T11:00:00.000Z';
const T2 = '2026-11-10T12:00:00.000Z';

function habit(id: string, updatedAt = T1, name = 'Movimento', deletedAt: string | null = null) {
  return {
    entity: 'habit',
    entityId: id,
    updatedAt,
    deletedAt,
    payload: {
      id,
      updatedAt,
      deletedAt,
      key: 'movement',
      name,
      description: '',
      type: 'minutes',
      target: 30,
      targetMax: null,
      active: true,
      order: 0,
      progressive: null,
    },
  };
}
function dailyLog(id: string, note: string | null, updatedAt = T1) {
  return {
    entity: 'dailyLog',
    entityId: id,
    updatedAt,
    deletedAt: null,
    payload: {
      id,
      updatedAt,
      deletedAt: null,
      date: '2026-11-10',
      stress: 3,
      mood: 3,
      energy: 3,
      sleepQuality: 3,
      note,
    },
  };
}

describe('sincronização', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let reset: () => Promise<void>;

  const push = (changes: unknown[], headers = headersA) =>
    app.inject({ method: 'POST', url: '/v1/sync', headers, payload: { changes } });
  const pull = (since: string | undefined, headers = headersA) =>
    app.inject({
      method: 'GET',
      url: since === undefined ? '/v1/sync' : `/v1/sync?since=${since}`,
      headers,
    });

  beforeAll(async () => {
    ({ app, prisma, reset } = await makeTestApp(undefined, 10_000));
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await reset();
    await prisma.participant.createMany({
      data: [
        {
          code: 'NEXO-AB23',
          keyHash: await hashKey(KEY_A),
          consentVersion: 1,
          consentAt: new Date(),
        },
        {
          code: 'NEXO-CD45',
          keyHash: await hashKey(KEY_B),
          consentVersion: 1,
          consentAt: new Date(),
        },
      ],
    });
  });

  it('exige autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/sync' });
    expect(res.statusCode).toBe(401);
  });

  it('push de 3 mudanças aplica 3 e o pull desde 0 devolve 3', async () => {
    const res = await push([habit('h1'), habit('h2'), dailyLog('d1', null)]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied).toBe(3);
    expect(typeof body.cursor).toBe('string');
    const got = await pull('0');
    expect(got.statusCode).toBe(200);
    const pulled = got.json();
    expect(pulled.changes).toHaveLength(3);
    expect(pulled.hasMore).toBe(false);
    expect(pulled.cursor).toBe(body.cursor);
    expect(pulled.changes[0].updatedAt).toBe(T1);
  });

  it('pull sem since equivale a 0', async () => {
    await push([habit('h1')]);
    expect((await pull(undefined)).json().changes).toHaveLength(1);
  });

  it('repetir o mesmo push aplica 0 e o pull desde o cursor devolve 0', async () => {
    const batch = [habit('h1'), habit('h2'), dailyLog('d1', null)];
    const first = (await push(batch)).json();
    const again = (await push(batch)).json();
    expect(again.applied).toBe(0);
    expect(again.cursor).toBe(first.cursor);
    const got = (await pull(first.cursor)).json();
    expect(got.changes).toHaveLength(0);
    expect(got.cursor).toBe(first.cursor);
    expect(await prisma.syncRecord.count()).toBe(3);
  });

  it('mudança com updatedAt mais antigo ou igual é ignorada', async () => {
    await push([habit('h1', T1, 'Novo')]);
    const older = await push([habit('h1', T0, 'Antigo')]);
    expect(older.json().applied).toBe(0);
    const tie = await push([habit('h1', T1, 'Empate')]);
    expect(tie.json().applied).toBe(0);
    const rows = (await pull('0')).json().changes;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.name).toBe('Novo');
  });

  it('mudança mais nova vence e ganha novo serverSeq (aparece no pull incremental)', async () => {
    const first = (await push([habit('h1', T1, 'A')])).json();
    const second = await push([habit('h1', T2, 'B')]);
    expect(second.json().applied).toBe(1);
    const got = (await pull(first.cursor)).json();
    expect(got.changes).toHaveLength(1);
    expect(got.changes[0].payload.name).toBe('B');
    expect(BigInt(got.cursor)).toBeGreaterThan(BigInt(first.cursor));
  });

  it('compara instantes, não strings (Z sem milissegundos vs .000Z)', async () => {
    await push([habit('h1', '2026-11-10T11:00:00Z', 'A')]);
    const res = await push([habit('h1', '2026-11-10T11:00:00.000Z', 'B')]);
    expect(res.json().applied).toBe(0);
  });

  it('tombstone é propagado', async () => {
    await push([habit('h1', T1)]);
    await push([habit('h1', T2, 'Movimento', T2)]);
    const [row] = (await pull('0')).json().changes;
    expect(row.deletedAt).toBe(T2);
  });

  it('dailyLog com note de texto é armazenado com note null', async () => {
    const res = await push([dailyLog('d1', 'texto privado')]);
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(1);
    const row = await prisma.syncRecord.findFirstOrThrow({ where: { entityId: 'd1' } });
    expect((row.payload as { note: unknown }).note).toBeNull();
  });

  it('updatedAt 10 min no futuro rejeita o lote inteiro com 400 clock_skew', async () => {
    const future = new Date(Date.now() + 2 * MAX_CLOCK_SKEW_MS).toISOString();
    const res = await push([habit('h1'), habit('h2', future)]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('clock_skew');
    expect(await prisma.syncRecord.count()).toBe(0);
  });

  it('rejeita envelope inconsistente com o payload', async () => {
    const bad = habit('h1');
    bad.entityId = 'outro';
    expect((await push([bad])).statusCode).toBe(400);
    const bad2 = habit('h1');
    bad2.payload.updatedAt = T0;
    expect((await push([bad2])).json().error).toBe('invalid_request');
    const bad3 = habit('h1');
    bad3.payload.deletedAt = T0;
    expect((await push([bad3])).statusCode).toBe(400);
  });

  it('rejeita payload inválido e lote acima de 500', async () => {
    const bad = habit('h1');
    (bad.payload as { target: unknown }).target = 'x';
    expect((await push([bad])).statusCode).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => habit(`h${i}`));
    expect((await push(many)).statusCode).toBe(400);
  });

  it('aceita lote de 500 mudanças (limite de corpo)', async () => {
    const many = Array.from({ length: 500 }, (_, i) => habit(`h${i}`));
    const res = await push(many);
    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(500);
  });

  it('participante A não vê mudanças do participante B', async () => {
    await push([habit('h1')], headersB);
    const a = (await pull('0', headersA)).json();
    expect(a.changes).toHaveLength(0);
    // mesmo entityId em outro participante não colide
    expect((await push([habit('h1')], headersA)).json().applied).toBe(1);
    expect((await pull('0', headersB)).json().changes).toHaveLength(1);
  });

  it('pushes concorrentes da mesma entidade: vence o mais novo e ambos dão 200', async () => {
    const [a, b] = await Promise.all([
      push([habit('h1', T2, 'Novo')]),
      push([habit('h1', T1, 'Velho')]),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const rows = (await pull('0')).json().changes;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.name).toBe('Novo');
  });

  it('pushes concorrentes de entidades diferentes: pull devolve tudo com serverSeq crescente', async () => {
    const batches = Array.from({ length: 6 }, (_, i) => [habit(`a${i}`), habit(`b${i}`)]);
    const results = await Promise.all(batches.map((b) => push(b)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect((await pull('0')).json().changes).toHaveLength(12);
    const seqs = (
      await prisma.syncRecord.findMany({
        orderBy: { serverSeq: 'asc' },
        select: { serverSeq: true },
      })
    ).map((r) => r.serverSeq);
    expect(seqs.every((s, i) => i === 0 || s > (seqs[i - 1] as bigint))).toBe(true);
  });

  it('o schema do servidor aceita toda entidade que o shared aceita (e note de texto no dailyLog)', () => {
    const samples: Record<string, unknown> = {
      habit: habit('h1'),
      habitEntry: {
        entity: 'habitEntry',
        entityId: 'e1',
        updatedAt: T1,
        deletedAt: null,
        payload: {
          id: 'e1',
          updatedAt: T1,
          deletedAt: null,
          habitId: 'h1',
          date: '2026-11-10',
          value: 1,
          blocks: [],
          targetSnapshot: 1,
          targetMaxSnapshot: null,
        },
      },
      dailyLog: dailyLog('d1', null),
    };
    for (const name of syncEntityName.options) {
      const change = samples[name];
      expect(change, `amostra para ${name}`).toBeDefined();
      expect(syncPushRequest.safeParse({ changes: [change] }).success, `shared: ${name}`).toBe(
        true,
      );
      expect(syncPushSchema.safeParse({ changes: [change] }).success, `servidor: ${name}`).toBe(
        true,
      );
    }
    expect(syncPushSchema.safeParse({ changes: [dailyLog('d1', 'texto')] }).success).toBe(true);
  });

  it('push espera o lock do participante e depois aparece no pull (sem lacuna de seq)', async () => {
    const { id } = await prisma.participant.findUniqueOrThrow({ where: { code: 'NEXO-AB23' } });
    const before = (await push([habit('h0')])).json().cursor as string;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      locked();
      await held;
    });
    await lockTaken;
    let done = false;
    const pending = push([habit('h1'), habit('h2')]).then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(done).toBe(false);
    release();
    await holder;
    const res = await pending;
    expect(res.json().applied).toBe(2);
    const got = (await pull(before)).json();
    expect(got.changes).toHaveLength(2);
  });

  it('since inválido devolve 400', async () => {
    expect((await pull('abc')).statusCode).toBe(400);
    expect((await pull('-1')).statusCode).toBe(400);
    expect((await pull('1.5')).statusCode).toBe(400);
  });

  it('pagina o pull em 1000 com hasMore', async () => {
    await prisma.$executeRaw`
      INSERT INTO sync_records (id, participant_id, entity, entity_id, payload, updated_at)
      SELECT gen_random_uuid()::text, p.id, 'habit', 'g' || n, '{}'::jsonb, now()
      FROM generate_series(1, 1001) n, participants p WHERE p.code = 'NEXO-AB23'`;
    const first = (await pull('0')).json();
    expect(first.changes).toHaveLength(1000);
    expect(first.hasMore).toBe(true);
  });
});
