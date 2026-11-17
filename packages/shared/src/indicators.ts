import type { Answers, Question, QuestionnaireDef } from './schemas/questionnaire';

export interface IndicatorInput {
  participantsWithCheckin: number;
  manualAttendance: number;
  educational: { correct: number; total: number }[];
  finalResponses: Answers[];
  initialResponses: Answers[];
  finalDef: QuestionnaireDef;
  initialDef: QuestionnaireDef;
  dailyStress: { participantId: string; date: string; stress: number }[];
  participantsWithMovementEntry: number;
  totalParticipants: number;
}

export type IndicatorStatus = 'below' | 'met' | 'comparison';

export interface Indicator {
  id:
    | 'participation'
    | 'comprehension'
    | 'acceptance'
    | 'adherence'
    | 'stress'
    | 'activity_frequency';
  value: string;
  target: string;
  status: IndicatorStatus;
  n: number;
  smallSample: boolean;
  detail?: Record<string, number | null>;
}

const SMALL_SAMPLE = 10;
const DAILY_MIN_DAYS = 14;
const DAILY_WINDOW = 7;
const AFFIRMATIVE = 'sim';

const round2 = (x: number): number => Math.round(x * 100) / 100;
const roundOrNull = (x: number | null): number | null => (x === null ? null : round2(x));
// Piso (não arredonda): nunca mostrar um valor que parece ter atingido a meta sem ter atingido.
const pct = (x: number): string => `${Math.floor(x * 100 + 1e-9)}%`;
const dec1 = (x: number | null): string => (x === null ? '—' : x.toFixed(1).replace('.', ','));

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Respostas numéricas das perguntas de um grupo (sempre por `group`, nunca por id). */
function numericAnswers(
  def: QuestionnaireDef,
  responses: Answers[],
  group: NonNullable<Question['group']>,
  type: Question['type'],
): { values: number[]; responding: number } {
  const ids = def.questions.filter((q) => q.group === group && q.type === type).map((q) => q.id);
  const values: number[] = [];
  let responding = 0;
  for (const r of responses) {
    const mine = ids.map((id) => r[id]).filter((v): v is number => typeof v === 'number');
    if (mine.length > 0) responding += 1;
    values.push(...mine);
  }
  return { values, responding };
}

function rateIndicator(
  id: Indicator['id'],
  ratio: number | null,
  target: string,
  threshold: number,
  n: number,
  detail?: Record<string, number | null>,
): Indicator {
  const empty = n === 0 || ratio === null;
  return {
    id,
    value: empty ? '—' : pct(ratio),
    target,
    status: !empty && ratio >= threshold ? 'met' : 'below',
    n,
    smallSample: n < SMALL_SAMPLE,
    ...(detail ? { detail } : {}),
  };
}

/** Média dos 7 primeiros e 7 últimos dias, por participante com >= 14 dias distintos. */
function dailyStressMeans(rows: IndicatorInput['dailyStress']): {
  first: number | null;
  last: number | null;
} {
  const byPerson = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const days = byPerson.get(r.participantId) ?? new Map<string, number>();
    days.set(r.date, r.stress);
    byPerson.set(r.participantId, days);
  }
  const firsts: number[] = [];
  const lasts: number[] = [];
  for (const days of byPerson.values()) {
    if (days.size < DAILY_MIN_DAYS) continue;
    const vals = [...days.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v);
    firsts.push(mean(vals.slice(0, DAILY_WINDOW)) as number);
    lasts.push(mean(vals.slice(-DAILY_WINDOW)) as number);
  }
  return { first: mean(firsts), last: mean(lasts) };
}

export function computeIndicators(i: IndicatorInput): Indicator[] {
  const finalCount = i.finalResponses.length;

  // Participação: check-ins distintos + presença manual (passar de 30 continua "na meta").
  const total = i.participantsWithCheckin + i.manualAttendance;
  const participation: Indicator = {
    id: 'participation',
    value: total === 0 ? '—' : String(total),
    target: '20–30 estudantes',
    status: total >= 20 ? 'met' : 'below',
    n: total,
    smallSample: total < SMALL_SAMPLE,
    detail: { checkins: i.participantsWithCheckin, manual: i.manualAttendance },
  };

  // Compreensão: acertos sobre todas as respostas do questionário educativo.
  const correct = i.educational.reduce((s, e) => s + e.correct, 0);
  const asked = i.educational.reduce((s, e) => s + e.total, 0);
  const comprehension = rateIndicator(
    'comprehension',
    asked === 0 ? null : correct / asked,
    '80% de acertos',
    0.8,
    i.educational.length,
  );

  // Aceitação: % das notas individuais de satisfação >= 4, em todos os finais.
  const sat = numericAnswers(i.finalDef, i.finalResponses, 'satisfaction', 'scale').values;
  const acceptance = rateIndicator(
    'acceptance',
    sat.length === 0 ? null : sat.filter((v) => v >= 4).length / sat.length,
    '80% positivas',
    0.8,
    finalCount,
  );

  // Adesão: % dos finais cuja pergunta single do grupo `adherence` foi respondida 'sim'.
  // A pergunta multi do mesmo grupo é ignorada na taxa.
  const adherenceIds = i.finalDef.questions
    .filter((q) => q.group === 'adherence' && q.type === 'single')
    .map((q) => q.id);
  const yes = i.finalResponses.filter((r) =>
    adherenceIds.some((id) => r[id] === AFFIRMATIVE),
  ).length;
  const adherence = rateIndicator(
    'adherence',
    finalCount === 0 ? null : yes / finalCount,
    '60%',
    0.6,
    finalCount,
    {
      checklistMovement:
        i.totalParticipants === 0
          ? null
          : round2(i.participantsWithMovementEntry / i.totalParticipants),
    },
  );

  // Estresse e frequência: comparação sem meta. n = respostas finais que trazem a medida.
  const stressBefore = mean(
    numericAnswers(i.initialDef, i.initialResponses, 'stress', 'scale').values,
  );
  const stressFinal = numericAnswers(i.finalDef, i.finalResponses, 'stress', 'scale');
  const stressAfter = mean(stressFinal.values);
  const daily = dailyStressMeans(i.dailyStress);
  const stress: Indicator = {
    id: 'stress',
    value: `antes ${dec1(stressBefore)} → depois ${dec1(stressAfter)}`,
    target: 'Comparar antes e depois',
    status: 'comparison',
    n: stressFinal.responding,
    smallSample: stressFinal.responding < SMALL_SAMPLE,
    detail: {
      questionnaireBefore: roundOrNull(stressBefore),
      questionnaireAfter: roundOrNull(stressAfter),
      dailyFirst7: roundOrNull(daily.first),
      dailyLast7: roundOrNull(daily.last),
    },
  };

  const freqBefore = mean(
    numericAnswers(i.initialDef, i.initialResponses, 'activity_frequency', 'number').values,
  );
  const freqFinal = numericAnswers(i.finalDef, i.finalResponses, 'activity_frequency', 'number');
  const freqAfter = mean(freqFinal.values);
  const activity: Indicator = {
    id: 'activity_frequency',
    value: `antes ${dec1(freqBefore)} → depois ${dec1(freqAfter)}`,
    target: 'Verificar mudanças',
    status: 'comparison',
    n: freqFinal.responding,
    smallSample: freqFinal.responding < SMALL_SAMPLE,
    detail: { before: roundOrNull(freqBefore), after: roundOrNull(freqAfter) },
  };

  return [participation, comprehension, acceptance, adherence, stress, activity];
}
