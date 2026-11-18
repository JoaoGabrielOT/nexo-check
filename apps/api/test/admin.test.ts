import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/db';
import { makeTestApp, testEnv } from './helpers';

const BOM = String.fromCharCode(0xfeff);
const HEADER =
  'codigo;checkins;educativo_pct;satisfacao_media;adesao;estresse_inicial;estresse_final;estresse_diario_inicio;estresse_diario_fim;freq_af_inicial;freq_af_final;dias_registrados;dias_com_movimento';
const SECRET_NOTE = 'OBSERVACAO-SECRETA-123';

describe('admin', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let reset: () => Promise<void>;
  let token: string;

  const auth = () => ({ authorization: `Bearer ${token}` });
  const login = (password: string) =>
    app.inject({ method: 'POST', url: '/v1/admin/login', payload: { password } });
  const createSession = (payload: object = {}) =>
    app.inject({
      method: 'POST',
      url: '/v1/admin/sessions',
      headers: auth(),
      payload: { workshop: 1, date: '2026-11-20', location: 'Sala 1', ...payload },
    });
  const newParticipant = (code: string) =>
    prisma.participant.create({
      data: { code, keyHash: 'x', consentAt: new Date(), consentVersion: 1 },
    });

  beforeAll(async () => {
    ({ app, prisma, reset } = await makeTestApp());
    token = (await login(testEnv.ADMIN_PASSWORD)).json().token;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await reset();
  });

  describe('login e autenticação', () => {
    it('senha errada devolve 401 e a certa devolve token', async () => {
      const bad = await login('senha-errada-qualquer');
      expect(bad.statusCode).toBe(401);
      expect(bad.json().error).toBe('unauthorized');
      const ok = await login(testEnv.ADMIN_PASSWORD);
      expect(ok.statusCode).toBe(200);
      expect(typeof ok.json().token).toBe('string');
    });

    it('rotas admin sem token ou com token inválido devolvem 401', async () => {
      for (const url of ['/v1/admin/stats', '/v1/admin/sessions', '/v1/admin/export.csv']) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
      }
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/stats',
        headers: { authorization: 'Bearer abc.def.ghi' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('token válido com sub diferente de admin é recusado', async () => {
      const forged = app.jwt.sign({ sub: 'outro' });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/stats',
        headers: { authorization: `Bearer ${forged}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('token assinado com outro segredo é recusado', async () => {
      const other = await makeTestApp({
        ADMIN_JWT_SECRET: 'outro-segredo-jwt-com-32-caracteres-ou-mais',
      });
      try {
        const foreign = other.app.jwt.sign({ sub: 'admin' });
        const res = await app.inject({
          method: 'GET',
          url: '/v1/admin/stats',
          headers: { authorization: `Bearer ${foreign}` },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await other.app.close();
      }
    });

    it('6ª tentativa de login em 15 minutos devolve 429', async () => {
      const t = await makeTestApp();
      try {
        const codes: number[] = [];
        for (let i = 0; i < 6; i++) {
          const r = await t.app.inject({
            method: 'POST',
            url: '/v1/admin/login',
            payload: { password: 'senha-errada-qualquer' },
          });
          codes.push(r.statusCode);
        }
        expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
      } finally {
        await t.app.close();
      }
    });
  });

  describe('sessões', () => {
    it('cria sessão com código de 6 caracteres, checkinUrl e expiração', async () => {
      const res = await createSession();
      expect(res.statusCode).toBe(201);
      const s = res.json();
      expect(s.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(s.checkinUrl).toBe(`https://nexo.example/checkin?c=${s.code}`);
      expect(s.date).toBe('2026-11-20');
      // fim do dia 20/11 em São Paulo (−03:00) + 24 h
      expect(s.expiresAt).toBe('2026-11-22T02:59:59.999Z');
      expect(s.checkins).toBe(0);
      expect(s.manualCount).toBe(0);
    });

    it('rejeita data inexistente, local vazio e oficina inválida', async () => {
      expect((await createSession({ date: '2026-02-31' })).statusCode).toBe(400);
      expect((await createSession({ location: '   ' })).statusCode).toBe(400);
      expect((await createSession({ workshop: 3 })).statusCode).toBe(400);
    });

    it('lista por data decrescente com contagem de check-ins', async () => {
      const a = (await createSession({ date: '2026-11-20' })).json();
      const b = (await createSession({ date: '2026-11-27', workshop: 2 })).json();
      const p = await newParticipant('NEXO-AB23');
      await prisma.checkin.create({ data: { participantId: p.id, sessionId: a.id } });
      const res = await app.inject({ method: 'GET', url: '/v1/admin/sessions', headers: auth() });
      const list = res.json();
      expect(list.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
      expect(list[1].checkins).toBe(1);
    });

    it('PATCH manual atualiza e valida limites; 404 se não existe', async () => {
      const s = (await createSession()).json();
      const patch = (id: string, manualCount: unknown) =>
        app.inject({
          method: 'PATCH',
          url: `/v1/admin/sessions/${id}/manual`,
          headers: auth(),
          payload: { manualCount },
        });
      const ok = await patch(s.id, 3);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().manualCount).toBe(3);
      expect((await patch(s.id, -1)).statusCode).toBe(400);
      expect((await patch(s.id, 1001)).statusCode).toBe(400);
      expect((await patch(s.id, 1.5)).statusCode).toBe(400);
      expect((await patch('inexistente', 1)).statusCode).toBe(404);
    });

    it('DELETE só sem check-ins (409 has_checkins), 404 se não existe', async () => {
      const s = (await createSession()).json();
      const p = await newParticipant('NEXO-AB23');
      await prisma.checkin.create({ data: { participantId: p.id, sessionId: s.id } });
      const del = (id: string) =>
        app.inject({ method: 'DELETE', url: `/v1/admin/sessions/${id}`, headers: auth() });
      const blocked = await del(s.id);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toBe('has_checkins');
      await prisma.checkin.deleteMany();
      expect((await del(s.id)).statusCode).toBe(204);
      expect((await del(s.id)).statusCode).toBe(404);
    });
  });

  describe('indicadores', () => {
    const stats = async () =>
      (await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: auth() })).json();
    type Ind = {
      id: string;
      value: string;
      status: string;
      n: number;
      detail?: Record<string, number | null>;
    };
    const byId = (s: { indicators: Ind[] }, id: string) =>
      s.indicators.find((i) => i.id === id) as Ind;

    it('PATCH manual 3 + 2 check-ins dá participação "5"', async () => {
      const s = (await createSession()).json();
      for (const code of ['NEXO-AB23', 'NEXO-CD34']) {
        const p = await newParticipant(code);
        await prisma.checkin.create({ data: { participantId: p.id, sessionId: s.id } });
      }
      await app.inject({
        method: 'PATCH',
        url: `/v1/admin/sessions/${s.id}/manual`,
        headers: auth(),
        payload: { manualCount: 3 },
      });
      const out = await stats();
      expect(byId(out, 'participation').value).toBe('5');
      expect(byId(out, 'participation').detail).toEqual({ checkins: 2, manual: 3 });
      expect(out.totals).toEqual({ participants: 2, sessions: 1 });
      expect(typeof out.generatedAt).toBe('string');
    });

    async function seedPilot() {
      const s = (await createSession()).json();
      const educ = {
        edu_bdnf: 'proteina',
        edu_bdnf_sangue: 'nao',
        edu_hipocampo: 'memoria',
        edu_hpa: 'respiracao', // errada
        edu_recompensa: 'motivacao',
        edu_prefrontal: 'executivas',
        edu_intensidade: 'leve_moderada',
        edu_modalidade: 'estudada',
        edu_huang: 'estudos_59',
        edu_parar: 'continuar', // errada
      };
      const ids: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const p = await newParticipant(`NEXO-AB${i + 10}`);
        ids.push(p.id);
        await prisma.checkin.create({ data: { participantId: p.id, sessionId: s.id } });
        const resp = (kind: string, answers: object) =>
          prisma.questionnaireResponse.create({
            data: {
              participantId: p.id,
              clientId: `${kind}-${i}`,
              kind,
              version: 1,
              answers,
              submittedAt: new Date(),
            },
          });
        await resp('educativo', educ);
        await resp('inicial', {
          af_dias_semana: 1,
          estresse_percebido: 4,
          dificuldades_outro: SECRET_NOTE,
        });
        const sat = i <= 8 ? 4 : 3;
        await resp('final', {
          af_dias_semana: 3,
          estresse_percebido: 2,
          satisfacao_1: sat,
          satisfacao_2: sat,
          satisfacao_3: sat,
          satisfacao_4: sat,
          satisfacao_5: sat,
          experimentou_atividade: i <= 6 ? 'sim' : 'nao',
        });
        const rec = (entity: string, entityId: string, payload: object, deleted = false) =>
          prisma.syncRecord.create({
            data: {
              participantId: p.id,
              entity,
              entityId,
              payload,
              updatedAt: new Date(),
              deletedAt: deleted ? new Date() : null,
            },
          });
        const entry = (habitId: string, value: number) => ({
          habitId,
          date: '2026-10-01',
          value,
        });
        await rec('habit', 'hm', { key: 'movement' });
        await rec('habit', 'hw', { key: 'water' });
        await rec('dailyLog', '2026-10-01', { date: '2026-10-01', stress: 5, note: SECRET_NOTE });
        if (i <= 4) await rec('habitEntry', 'hm:2026-10-01', entry('hm', 1));
        // 5: entrada apagada; 6: valor 0; 7: hábito que não é movimento
        if (i === 5) await rec('habitEntry', 'hm:2026-10-01', entry('hm', 1), true);
        if (i === 6) await rec('habitEntry', 'hm:2026-10-01', entry('hm', 0));
        if (i === 7) await rec('habitEntry', 'hw:2026-10-01', entry('hw', 2));
      }
      // 14 dias de estresse diário para o primeiro participante: 5 nos 7 primeiros, 1 nos 7 últimos
      for (let d = 1; d <= 14; d++) {
        const date = `2026-10-${String(d + 1).padStart(2, '0')}`;
        await prisma.syncRecord.create({
          data: {
            participantId: ids[0] as string,
            entity: 'dailyLog',
            entityId: date,
            payload: { date, stress: d <= 7 ? 5 : 1 },
            updatedAt: new Date(),
          },
        });
      }
    }

    it('cenário de 10 participantes reproduz compreensão, aceitação e adesão', async () => {
      await seedPilot();
      const out = await stats();
      expect(byId(out, 'participation').value).toBe('10');
      const comp = byId(out, 'comprehension');
      expect([comp.value, comp.status, comp.n]).toEqual(['80%', 'met', 10]);
      const acc = byId(out, 'acceptance');
      expect([acc.value, acc.status, acc.n]).toEqual(['80%', 'met', 10]);
      const adh = byId(out, 'adherence');
      expect([adh.value, adh.status]).toEqual(['60%', 'met']);
      expect(adh.detail).toEqual({ checklistMovement: 0.4 });
      expect(byId(out, 'stress').detail).toMatchObject({
        questionnaireBefore: 4,
        questionnaireAfter: 2,
        dailyFirst7: 5,
        dailyLast7: 1,
      });
      expect(byId(out, 'activity_frequency').detail).toEqual({ before: 1, after: 3 });
    });

    it('CSV tem BOM, cabeçalho exato, uma linha por participante e nenhum texto livre', async () => {
      await seedPilot();
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/export.csv',
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="nexo-indicadores-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      const body = res.body;
      expect(body.startsWith(BOM + HEADER + '\r\n')).toBe(true);
      expect(body).not.toContain(SECRET_NOTE);
      const [people, indicators] = body.slice(1).split('\r\n\r\n');
      const lines = (people as string).split('\r\n');
      expect(lines).toHaveLength(11);
      const first = (lines.find((l) => l.startsWith('NEXO-AB11;')) as string).split(';');
      // checkins, educativo %, satisfação, adesão, estresse ini/fin, diário ini/fim, freq, dias
      expect(first.slice(1)).toEqual([
        '1',
        '80',
        '4',
        'sim',
        '4',
        '2',
        '5',
        '1',
        '1',
        '3',
        '15',
        '1',
      ]);
      const iLines = (indicators as string).trim().split('\r\n');
      expect(iLines[0]).toBe('indicador;valor;meta;status;n');
      expect(iLines).toHaveLength(7);
      expect(iLines[1]).toMatch(/^participation;10;/);
    });
  });
});
