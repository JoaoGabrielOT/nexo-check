import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ADMIN_JWT_TTL,
  adminLoginRequest,
  computeIndicators,
  generateSessionCode,
  manualAttendanceUpdate,
  SESSION_VALID_HOURS_AFTER,
  sessionCreate,
  toCsv,
  type QuestionnaireDef,
  type SessionView,
} from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../db';
import type { Env } from '../env';
import { ADMIN_SUBJECT, requireAdmin } from '../plugins/admin-auth';
import { loadStatsData, toIndicatorInput, type ParticipantData } from '../services/stats';

const MAX_MANUAL = 1000;
const MAX_LOCATION = 120;
const CODE_RETRIES = 5;
const HOUR_MS = 3_600_000;
// America/Sao_Paulo não tem horário de verão desde 2019: o fim do dia local (23:59:59.999 −03:00)
// é 02:59:59.999Z do dia seguinte, ou seja, meia-noite UTC do dia + 27 h - 1 ms.
const SAO_PAULO_END_OF_DAY_MS = 27 * HOUR_MS - 1;

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

const idParams = z.object({ id: z.string().min(1).max(64) });
const manualBody = z.object({
  manualCount: manualAttendanceUpdate.shape.manualCount.max(MAX_MANUAL),
});

type SessionRow = {
  id: string;
  workshop: number;
  date: Date;
  location: string;
  code: string;
  expiresAt: Date;
  manualCount: number;
  _count: { checkins: number };
};

function toView(row: SessionRow, webUrl: string): SessionView {
  return {
    id: row.id,
    workshop: row.workshop === 1 ? 1 : 2,
    date: row.date.toISOString().slice(0, 10),
    location: row.location,
    code: row.code,
    checkinUrl: `${webUrl}/checkin?c=${row.code}`,
    expiresAt: row.expiresAt.toISOString(),
    checkins: row._count.checkins,
    manualCount: row.manualCount,
  };
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

function satisfactionValues(def: QuestionnaireDef, responses: ParticipantData['final']) {
  const ids = def.questions
    .filter((q) => q.group === 'satisfaction' && q.type === 'scale')
    .map((q) => q.id);
  return responses.flatMap((r) =>
    ids.map((id) => r[id]).filter((v): v is number => typeof v === 'number'),
  );
}

/** Prefixa com apóstrofo valores que o Excel leria como fórmula. */
const safe = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
/** Números com vírgula decimal (o separador do CSV é `;`); vazio quando não há dado. */
const num = (x: number | null | undefined): string =>
  x === null || x === undefined ? '' : String(Math.round(x * 100) / 100).replace('.', ',');

const CSV_COLUMNS = [
  'codigo',
  'checkins',
  'educativo_pct',
  'satisfacao_media',
  'adesao',
  'estresse_inicial',
  'estresse_final',
  'estresse_diario_inicio',
  'estresse_diario_fim',
  'freq_af_inicial',
  'freq_af_final',
  'dias_registrados',
  'dias_com_movimento',
];

function participantRow(
  p: ParticipantData,
  defs: { initial: QuestionnaireDef; final: QuestionnaireDef },
): Record<string, string> {
  const correct = p.educational.reduce((s, e) => s + e.correct, 0);
  const asked = p.educational.reduce((s, e) => s + e.total, 0);
  const adherenceIds = defs.final.questions
    .filter((q) => q.group === 'adherence' && q.type === 'single')
    .map((q) => q.id);
  const answered = p.final.flatMap((r) =>
    adherenceIds.map((id) => r[id]).filter((v): v is string => typeof v === 'string'),
  );
  // Reaproveita as regras dos indicadores (7 primeiros x 7 últimos dias, antes x depois).
  const own = computeIndicators({
    participantsWithCheckin: 0,
    manualAttendance: 0,
    educational: [],
    finalResponses: p.final,
    initialResponses: p.initial,
    finalDef: defs.final,
    initialDef: defs.initial,
    dailyStress: p.dailyStress,
    participantsWithMovementEntry: 0,
    totalParticipants: 1,
  });
  const stress = own.find((i) => i.id === 'stress')?.detail ?? {};
  const freq = own.find((i) => i.id === 'activity_frequency')?.detail ?? {};
  return {
    codigo: safe(p.code),
    checkins: String(p.checkins),
    educativo_pct: asked === 0 ? '' : String(Math.round((correct / asked) * 100)),
    satisfacao_media: num(mean(satisfactionValues(defs.final, p.final))),
    adesao: answered.length === 0 ? '' : answered.includes('sim') ? 'sim' : 'nao',
    estresse_inicial: num(stress.questionnaireBefore),
    estresse_final: num(stress.questionnaireAfter),
    estresse_diario_inicio: num(stress.dailyFirst7),
    estresse_diario_fim: num(stress.dailyLast7),
    freq_af_inicial: num(freq.before),
    freq_af_final: num(freq.after),
    dias_registrados: String(p.recordedDays.size),
    dias_com_movimento: String(p.movementDays.size),
  };
}

const notFound = { error: 'not_found', message: 'Sessão não encontrada.' };
const hasCheckins = {
  error: 'has_checkins',
  message: 'A sessão já tem check-ins e não pode ser excluída.',
};

export async function adminRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; env: Env; loginLimitMax: number },
): Promise<void> {
  const { prisma, env } = opts;
  const webUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');
  const passwordHash = sha256(env.ADMIN_PASSWORD);
  const admin = { preHandler: requireAdmin };
  const include = { _count: { select: { checkins: true } } } as const;

  app.post(
    '/admin/login',
    { config: { rateLimit: { max: opts.loginLimitMax, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { password } = adminLoginRequest.parse(req.body);
      // Hashes SHA-256 têm sempre 32 bytes: timingSafeEqual não vaza o tamanho da senha.
      if (!timingSafeEqual(sha256(password), passwordHash)) {
        return reply.status(401).send({ error: 'unauthorized', message: 'Senha incorreta.' });
      }
      const token = app.jwt.sign({ sub: ADMIN_SUBJECT }, { expiresIn: ADMIN_JWT_TTL });
      return reply.send({ token });
    },
  );

  app.get('/admin/sessions', admin, async () => {
    const rows = await prisma.workshopSession.findMany({
      include,
      orderBy: [{ date: 'desc' }, { expiresAt: 'desc' }],
    });
    return rows.map((r) => toView(r, webUrl));
  });

  app.post('/admin/sessions', admin, async (req, reply) => {
    const body = sessionCreate.parse(req.body);
    const location = body.location.trim();
    const date = new Date(`${body.date}T00:00:00.000Z`);
    if (
      location.length === 0 ||
      location.length > MAX_LOCATION ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== body.date
    ) {
      return reply
        .status(400)
        .send({ error: 'invalid_request', message: 'Data ou local da oficina inválidos.' });
    }
    const expiresAt = new Date(
      date.getTime() + SAO_PAULO_END_OF_DAY_MS + SESSION_VALID_HOURS_AFTER * HOUR_MS,
    );
    for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
      try {
        const row = await prisma.workshopSession.create({
          data: { workshop: body.workshop, date, location, code: generateSessionCode(), expiresAt },
          include,
        });
        return reply.status(201).send(toView(row, webUrl));
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    throw new Error('Não foi possível gerar um código de sessão único.');
  });

  app.patch('/admin/sessions/:id/manual', admin, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { manualCount } = manualBody.parse(req.body);
    try {
      const row = await prisma.workshopSession.update({
        where: { id },
        data: { manualCount },
        include,
      });
      return toView(row, webUrl);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2025') throw err;
      return reply.status(404).send(notFound);
    }
  });

  app.delete('/admin/sessions/:id', admin, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const row = await prisma.workshopSession.findUnique({ where: { id }, include });
    if (!row) return reply.status(404).send(notFound);
    if (row._count.checkins > 0) return reply.status(409).send(hasCheckins);
    // A condição no delete evita apagar uma sessão que recebeu check-in depois da leitura.
    const res = await prisma.workshopSession.deleteMany({ where: { id, checkins: { none: {} } } });
    if (res.count === 0) return reply.status(409).send(hasCheckins);
    return reply.status(204).send();
  });

  app.get('/admin/stats', admin, async () => {
    const data = await loadStatsData(prisma);
    return {
      indicators: computeIndicators(toIndicatorInput(data)),
      generatedAt: new Date().toISOString(),
      totals: { participants: data.participants.length, sessions: data.sessions },
    };
  });

  app.get('/admin/export.csv', admin, async (_req, reply) => {
    const data = await loadStatsData(prisma);
    const indicators = computeIndicators(toIndicatorInput(data));
    const people = toCsv(
      data.participants.map((p) => participantRow(p, data.defs)),
      CSV_COLUMNS,
    );
    const summary = toCsv(
      indicators.map((i) => ({
        indicador: i.id,
        valor: safe(i.value),
        meta: safe(i.target),
        status: i.status,
        n: i.n,
      })),
      ['indicador', 'valor', 'meta', 'status', 'n'],
    );
    // Segundo bloco sem o BOM (já veio no primeiro), separado por uma linha em branco.
    const body = `${people}\r\n${summary.slice(1)}`;
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="nexo-indicadores-${day}.csv"`)
      .send(body);
  });
}
