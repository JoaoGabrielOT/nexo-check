import { generateRecoveryKey, getQuestionnaire, MAX_CLOCK_SKEW_MS } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/db';
import { hashKey } from '../src/plugins/participant-auth';
import { makeTestApp } from './helpers';

const KEY = generateRecoveryKey();
const headers = { 'x-participant-code': 'NEXO-AB23', 'x-participant-key': KEY };
const NOW = () => new Date().toISOString();

const edu = getQuestionnaire('educativo');
const ini = getQuestionnaire('inicial');
const singles = edu.questions.filter((q) => q.type === 'single');
function pick(type: string) {
  const q = ini.questions.find(
    (x) => x.type === type && (type !== 'number' || x.max !== undefined),
  );
  if (!q) throw new Error(`sem pergunta ${type}`);
  return q;
}
const textQ = pick('text');
const numberQ = pick('number');
const numberMax = numberQ.max ?? 0;
const scaleQ = pick('scale');

/** Respostas do educativo com `rights` certas e o resto errado. */
function eduAnswers(rights: number): Record<string, string> {
  return Object.fromEntries(
    singles.map((q, i) => {
      const wrong = q.options?.find((o) => o.value !== q.correct)?.value ?? 'x';
      return [q.id, i < rights ? (q.correct ?? wrong) : wrong];
    }),
  );
}

describe('POST /v1/questionnaires', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let reset: () => Promise<void>;
  let participantId: string;

  const post = (payload: object, h: Record<string, string> = headers) =>
    app.inject({ method: 'POST', url: '/v1/questionnaires', headers: h, payload });
  const body = (over: Record<string, unknown> = {}) => ({
    id: 'q-1',
    kind: 'educativo',
    version: edu.version,
    answers: eduAnswers(5),
    submittedAt: NOW(),
    ...over,
  });
  const inicial = (answers: object, id = 'q-3') => ({
    id,
    kind: 'inicial',
    version: ini.version,
    answers,
    submittedAt: NOW(),
  });

  beforeAll(async () => {
    ({ app, prisma, reset } = await makeTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await reset();
    const p = await prisma.participant.create({
      data: {
        code: 'NEXO-AB23',
        keyHash: await hashKey(KEY),
        consentAt: new Date(),
        consentVersion: 1,
      },
    });
    participantId = p.id;
  });

  it('exige autenticação', async () => {
    expect((await post(body(), {})).statusCode).toBe(401);
  });

  it('recalcula a nota do educativo ignorando a enviada', async () => {
    expect(singles).toHaveLength(10);
    const res = await post(body({ score: 1 }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ score: 0.5 });
    const row = await prisma.questionnaireResponse.findFirstOrThrow();
    expect(row.score).toBe(0.5);
    expect(row.participantId).toBe(participantId);
    expect(row.clientId).toBe('q-1');
  });

  it('não persiste respostas de texto', async () => {
    const res = await post(inicial({ [textQ.id]: 'segredo' }, 'q-2'));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ score: null });
    const row = await prisma.questionnaireResponse.findFirstOrThrow();
    expect(JSON.stringify(row.answers)).not.toContain('segredo');
  });

  it('reenviar o mesmo id devolve 200 com a nota guardada e não duplica', async () => {
    expect((await post(body())).statusCode).toBe(201);
    const again = await post(body({ answers: eduAnswers(9) }));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ score: 0.5 });
    expect(await prisma.questionnaireResponse.count()).toBe(1);
  });

  it('envios simultâneos do mesmo id geram uma linha', async () => {
    const rs = await Promise.all([post(body()), post(body()), post(body())]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(await prisma.questionnaireResponse.count()).toBe(1);
  });

  it('versão diferente é aceita e guardada, sem nota', async () => {
    const res = await post(body({ version: edu.version + 1, answers: { qualquer: 'x' } }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ score: null });
    const row = await prisma.questionnaireResponse.findFirstOrThrow();
    expect(row.version).toBe(edu.version + 1);
    expect(row.answers).toEqual({ qualquer: 'x' });
  });

  it('versão diferente ainda remove texto de perguntas conhecidas', async () => {
    const res = await post(inicial({ [textQ.id]: 'segredo' }, 'q-4'));
    expect(res.statusCode).toBe(201);
    const other = await post({ ...inicial({ [textQ.id]: 'segredo2' }, 'q-5'), version: 99 });
    expect(other.statusCode).toBe(201);
    const rows = await prisma.questionnaireResponse.findMany();
    expect(JSON.stringify(rows.map((r) => r.answers))).not.toContain('segredo');
  });

  it('rejeita pergunta desconhecida ou valor inválido na versão atual', async () => {
    expect((await post(body({ answers: { nao_existe: 'a' } }))).statusCode).toBe(400);
    const bad = await post(body({ answers: { [singles[0]?.id ?? 'x']: 'fora_das_opcoes' } }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('invalid_request');
    expect((await post(inicial({ [numberQ.id]: 'muito' }))).statusCode).toBe(400);
    expect((await post(inicial({ [numberQ.id]: numberMax + 1 }))).statusCode).toBe(400);
    expect((await post(inicial({ [scaleQ.id]: 9 }))).statusCode).toBe(400);
    expect((await post(inicial({ [scaleQ.id]: 2.5 }))).statusCode).toBe(400);
    expect(await prisma.questionnaireResponse.count()).toBe(0);
  });

  it('aceita respostas válidas do inicial', async () => {
    const res = await post(inicial({ [scaleQ.id]: 3, [numberQ.id]: numberMax }));
    expect(res.statusCode).toBe(201);
  });

  it('rejeita kind desconhecido', async () => {
    expect((await post(body({ kind: 'outro' }))).statusCode).toBe(400);
  });

  it('rejeita submittedAt no futuro', async () => {
    const future = new Date(Date.now() + MAX_CLOCK_SKEW_MS + 60_000).toISOString();
    const res = await post(body({ submittedAt: future }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('clock_skew');
  });
});
