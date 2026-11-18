import {
  getQuestionnaire,
  scoreEducational,
  type Answers,
  type IndicatorInput,
  type QuestionnaireDef,
} from '@nexo/shared';
import type { PrismaClient } from '../db';

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json => (v !== null && typeof v === 'object' ? (v as Json) : {});
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export interface ParticipantData {
  id: string;
  code: string;
  checkins: number;
  /** Nota do educativo por resposta (só versão atual). */
  educational: { correct: number; total: number }[];
  initial: Answers[];
  final: Answers[];
  dailyStress: { participantId: string; date: string; stress: number }[];
  /** Datas distintas com registro de hábito ou do dia. */
  recordedDays: Set<string>;
  movementDays: Set<string>;
}

export interface StatsData {
  participants: ParticipantData[];
  manualAttendance: number;
  sessions: number;
  defs: { initial: QuestionnaireDef; final: QuestionnaireDef };
}

/** Lê tudo o que os indicadores usam, agrupado por participante (sem texto livre). */
export async function loadStatsData(prisma: PrismaClient): Promise<StatsData> {
  const defs = {
    initial: getQuestionnaire('inicial'),
    educational: getQuestionnaire('educativo'),
    final: getQuestionnaire('final'),
  };
  const [people, checkins, sessions, responses, records] = await Promise.all([
    prisma.participant.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } }),
    prisma.checkin.groupBy({ by: ['participantId'], _count: { _all: true } }),
    prisma.workshopSession.findMany({ select: { manualCount: true } }),
    prisma.questionnaireResponse.findMany({
      select: { participantId: true, kind: true, version: true, answers: true },
    }),
    prisma.syncRecord.findMany({
      where: { deletedAt: null, entity: { in: ['habit', 'habitEntry', 'dailyLog'] } },
      select: { participantId: true, entity: true, entityId: true, payload: true },
    }),
  ]);

  const byId = new Map<string, ParticipantData>(
    people.map((p) => [
      p.id,
      {
        id: p.id,
        code: p.code,
        checkins: 0,
        educational: [],
        initial: [],
        final: [],
        dailyStress: [],
        recordedDays: new Set(),
        movementDays: new Set(),
      },
    ]),
  );
  for (const c of checkins) {
    const p = byId.get(c.participantId);
    if (p) p.checkins = c._count._all;
  }
  for (const r of responses) {
    const p = byId.get(r.participantId);
    if (!p) continue;
    const answers = asObject(r.answers) as Answers;
    if (r.kind === 'educativo') {
      if (r.version !== defs.educational.version) continue;
      const { correct, total } = scoreEducational(defs.educational, answers);
      p.educational.push({ correct, total });
    } else if (r.kind === 'inicial') p.initial.push(answers);
    else if (r.kind === 'final') p.final.push(answers);
  }

  // Hábitos de movimento por participante; as entradas só contam se apontarem para um deles.
  const movementHabits = new Set<string>();
  for (const r of records) {
    if (r.entity === 'habit' && asObject(r.payload).key === 'movement') {
      movementHabits.add(`${r.participantId}:${r.entityId}`);
    }
  }
  for (const r of records) {
    const p = byId.get(r.participantId);
    if (!p) continue;
    const payload = asObject(r.payload);
    const date = asString(payload.date);
    if (!date) continue;
    if (r.entity === 'dailyLog') {
      p.recordedDays.add(date);
      const stress = asNumber(payload.stress);
      if (stress !== null) p.dailyStress.push({ participantId: p.id, date, stress });
    } else if (r.entity === 'habitEntry') {
      p.recordedDays.add(date);
      const value = asNumber(payload.value);
      const habitId = asString(payload.habitId);
      if (value !== null && value > 0 && habitId && movementHabits.has(`${p.id}:${habitId}`)) {
        p.movementDays.add(date);
      }
    }
  }

  return {
    participants: [...byId.values()],
    manualAttendance: sessions.reduce((s, x) => s + x.manualCount, 0),
    sessions: sessions.length,
    defs: { initial: defs.initial, final: defs.final },
  };
}

export function toIndicatorInput(data: StatsData): IndicatorInput {
  const ps = data.participants;
  return {
    participantsWithCheckin: ps.filter((p) => p.checkins > 0).length,
    manualAttendance: data.manualAttendance,
    educational: ps.flatMap((p) => p.educational),
    finalResponses: ps.flatMap((p) => p.final),
    initialResponses: ps.flatMap((p) => p.initial),
    finalDef: data.defs.final,
    initialDef: data.defs.initial,
    dailyStress: ps.flatMap((p) => p.dailyStress),
    participantsWithMovementEntry: ps.filter((p) => p.movementDays.size > 0).length,
    totalParticipants: ps.length,
  };
}

export async function buildIndicatorInput(prisma: PrismaClient): Promise<IndicatorInput> {
  return toIndicatorInput(await loadStatsData(prisma));
}
