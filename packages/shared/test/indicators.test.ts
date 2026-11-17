import { describe, expect, it } from 'vitest';
import { computeIndicators, type Indicator, type IndicatorInput } from '../src/indicators';
import type { Answers, QuestionnaireDef } from '../src/schemas/questionnaire';

const scale = (id: string, group: 'satisfaction' | 'stress') => ({
  id,
  type: 'scale' as const,
  label: id,
  min: 1,
  max: 5,
  group,
});

const finalDef: QuestionnaireDef = {
  kind: 'final',
  version: 1,
  draft: false,
  title: 't',
  intro: 'i',
  questions: [
    { id: 'freq', type: 'number', label: 'f', group: 'activity_frequency' },
    scale('est', 'stress'),
    scale('s1', 'satisfaction'),
    scale('s2', 'satisfaction'),
    {
      id: 'exp',
      type: 'single',
      label: 'e',
      options: [
        { value: 'sim', label: 'Sim' },
        { value: 'nao', label: 'Não' },
      ],
      group: 'adherence',
    },
    {
      id: 'quais',
      type: 'multi',
      label: 'q',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      group: 'adherence',
    },
  ],
};
const initialDef: QuestionnaireDef = {
  ...finalDef,
  kind: 'inicial',
  questions: finalDef.questions.filter((q) => q.id === 'freq' || q.id === 'est'),
};

function base(over: Partial<IndicatorInput> = {}): IndicatorInput {
  return {
    participantsWithCheckin: 0,
    manualAttendance: 0,
    educational: [],
    finalResponses: [],
    initialResponses: [],
    finalDef,
    initialDef,
    dailyStress: [],
    participantsWithMovementEntry: 0,
    totalParticipants: 0,
    ...over,
  };
}
function get(i: IndicatorInput, id: string): Indicator {
  const found = computeIndicators(i).find((x) => x.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe('computeIndicators', () => {
  it('retorna os 6 indicadores na ordem', () => {
    expect(computeIndicators(base()).map((x) => x.id)).toEqual([
      'participation',
      'comprehension',
      'acceptance',
      'adherence',
      'stress',
      'activity_frequency',
    ]);
  });

  it('participação soma check-ins e manuais', () => {
    const p = get(base({ participantsWithCheckin: 18, manualAttendance: 3 }), 'participation');
    expect(p).toMatchObject({ value: '21', status: 'met', n: 21, target: '20–30 estudantes' });
    expect(p.detail).toEqual({ checkins: 18, manual: 3 });
    expect(get(base({ participantsWithCheckin: 15 }), 'participation').status).toBe('below');
  });

  it('compreensão soma acertos', () => {
    const mk = (c: number) => [
      { correct: c, total: 25 },
      { correct: 0, total: 25 },
    ];
    const ok = get(
      base({
        educational: [
          { correct: 40, total: 25 },
          { correct: 0, total: 25 },
        ],
      }),
      'comprehension',
    );
    expect(ok).toMatchObject({ value: '80%', status: 'met', n: 2, smallSample: true });
    expect(get(base({ educational: mk(39) }), 'comprehension').status).toBe('below');
    expect(get(base(), 'comprehension')).toMatchObject({ value: '—', status: 'below', n: 0 });
  });

  it('aceitação conta notas >= 4 nas perguntas de satisfação', () => {
    const finals: Answers[] = Array.from({ length: 5 }, (_, i) => ({
      s1: 5,
      s2: i === 0 ? 2 : 4,
    }));
    const a = get(base({ finalResponses: finals }), 'acceptance');
    expect(a).toMatchObject({ value: '90%', status: 'met', n: 5, target: '80% positivas' });
    const low = get(base({ finalResponses: [{ s1: 3, s2: 4 }] }), 'acceptance');
    expect(low).toMatchObject({ value: '50%', status: 'below' });
  });

  it('adesão usa a pergunta single e ignora a multi', () => {
    const finals: Answers[] = [
      ...Array.from({ length: 6 }, () => ({ exp: 'sim', quais: ['a'] })),
      ...Array.from({ length: 4 }, () => ({ exp: 'nao', quais: ['a', 'b'] })),
    ];
    const a = get(
      base({ finalResponses: finals, participantsWithMovementEntry: 3, totalParticipants: 4 }),
      'adherence',
    );
    expect(a).toMatchObject({ value: '60%', status: 'met', n: 10, smallSample: false });
    expect(a.detail?.checklistMovement).toBe(0.75);
  });

  it('estresse compara antes e depois e usa só quem tem >= 14 dias', () => {
    const days = (pid: string, n: number, f: (d: number) => number) =>
      Array.from({ length: n }, (_, d) => ({
        participantId: pid,
        date: `2026-03-${String(d + 1).padStart(2, '0')}`,
        stress: f(d),
      }));
    const s = get(
      base({
        initialResponses: [{ est: 4 }, { est: 3 }],
        finalResponses: [{ est: 2 }, { est: 3 }],
        dailyStress: [...days('a', 14, (d) => (d < 7 ? 4 : 2)), ...days('b', 13, () => 5)],
      }),
      'stress',
    );
    expect(s).toMatchObject({
      value: 'antes 3,5 → depois 2,5',
      status: 'comparison',
      target: 'Comparar antes e depois',
    });
    expect(s.detail).toEqual({
      questionnaireBefore: 3.5,
      questionnaireAfter: 2.5,
      dailyFirst7: 4,
      dailyLast7: 2,
    });
  });

  it('estresse sem dados dá null e status comparison', () => {
    const s = get(base(), 'stress');
    expect(s.status).toBe('comparison');
    expect(s.value).toBe('antes — → depois —');
    expect(s.detail).toEqual({
      questionnaireBefore: null,
      questionnaireAfter: null,
      dailyFirst7: null,
      dailyLast7: null,
    });
  });

  it('frequência compara médias inicial x final', () => {
    const f = get(
      base({ initialResponses: [{ freq: 1 }, { freq: 2 }], finalResponses: [{ freq: 4 }] }),
      'activity_frequency',
    );
    expect(f).toMatchObject({
      value: 'antes 1,5 → depois 4,0',
      status: 'comparison',
      target: 'Verificar mudanças',
      n: 1,
      smallSample: true,
    });
  });
});
