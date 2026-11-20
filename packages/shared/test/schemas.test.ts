import {
  checkinRequest,
  manualAttendanceUpdate,
  sessionCreate,
  syncPushRequest,
} from '../src/schemas/api';
import {
  dailyLogSchema,
  habitEntrySchema,
  habitSchema,
  syncChangeSchema,
} from '../src/schemas/entities';

const T = '2026-03-01T10:00:00.000Z';
const meta = { id: 'x', updatedAt: T, deletedAt: null };
const entry = {
  ...meta,
  habitId: 'h',
  date: '2026-03-01',
  value: 1,
  blocks: [],
  targetSnapshot: 10,
  targetMaxSnapshot: null,
};
const change = (n: number) => ({
  entity: 'habitEntry' as const,
  entityId: `h:${n}`,
  payload: entry,
  updatedAt: T,
  deletedAt: null,
});

const habit = {
  ...meta,
  key: null,
  name: 'Leitura',
  description: '',
  type: 'minutes' as const,
  target: 15,
  targetMax: null,
  active: true,
  order: 0,
  progressive: null,
};

describe('limites de tamanho e datas', () => {
  test('habit: name até 80 e description até 200', () => {
    expect(habitSchema.safeParse({ ...habit, name: 'a'.repeat(80) }).success).toBe(true);
    expect(habitSchema.safeParse({ ...habit, name: 'a'.repeat(81) }).success).toBe(false);
    expect(habitSchema.safeParse({ ...habit, description: 'a'.repeat(200) }).success).toBe(true);
    expect(habitSchema.safeParse({ ...habit, description: 'a'.repeat(201) }).success).toBe(false);
  });
  test('habit: metas negativas ou infinitas são rejeitadas', () => {
    expect(habitSchema.safeParse({ ...habit, target: -1 }).success).toBe(false);
    expect(habitSchema.safeParse({ ...habit, targetMax: -1 }).success).toBe(false);
    expect(habitSchema.safeParse({ ...habit, target: Infinity }).success).toBe(false);
  });
  test('entry: blocks até 200 e números não negativos', () => {
    expect(habitEntrySchema.safeParse({ ...entry, blocks: Array(200).fill(5) }).success).toBe(true);
    expect(habitEntrySchema.safeParse({ ...entry, blocks: Array(201).fill(5) }).success).toBe(
      false,
    );
    expect(habitEntrySchema.safeParse({ ...entry, blocks: [-1] }).success).toBe(false);
    expect(habitEntrySchema.safeParse({ ...entry, value: -1 }).success).toBe(false);
    expect(habitEntrySchema.safeParse({ ...entry, targetSnapshot: -1 }).success).toBe(false);
  });
  test('dateKey rejeita datas que não existem', () => {
    expect(habitEntrySchema.safeParse({ ...entry, date: '2026-02-30' }).success).toBe(false);
    expect(habitEntrySchema.safeParse({ ...entry, date: '2026-13-01' }).success).toBe(false);
    expect(habitEntrySchema.safeParse({ ...entry, date: '2028-02-29' }).success).toBe(true);
    expect(
      sessionCreate.safeParse({ workshop: 1, date: '2026-02-30', location: 'x' }).success,
    ).toBe(false);
  });
});

describe('schemas', () => {
  test('push aceita 500 e rejeita 501', () => {
    expect(
      syncPushRequest.safeParse({ changes: Array.from({ length: 500 }, (_, i) => change(i)) })
        .success,
    ).toBe(true);
    expect(
      syncPushRequest.safeParse({ changes: Array.from({ length: 501 }, (_, i) => change(i)) })
        .success,
    ).toBe(false);
  });
  test('updatedAt não ISO é rejeitado', () => {
    expect(syncChangeSchema.safeParse({ ...change(1), updatedAt: 'ontem' }).success).toBe(false);
  });
  test('payload é validado por entidade', () => {
    expect(syncChangeSchema.safeParse({ ...change(1), payload: { foo: 1 } }).success).toBe(false);
    expect(syncChangeSchema.safeParse({ ...change(1), entity: 'dailyLog' }).success).toBe(false);
  });
  test('targetMaxSnapshot >= targetSnapshot', () => {
    expect(habitEntrySchema.safeParse({ ...entry, targetMaxSnapshot: 9 }).success).toBe(false);
    expect(habitEntrySchema.safeParse({ ...entry, targetMaxSnapshot: 10 }).success).toBe(true);
  });
  test('dailyLog: escala inteira 1-5 e data', () => {
    const log = {
      ...meta,
      date: '2026-03-01',
      stress: 3,
      mood: 3,
      energy: 3,
      sleepQuality: 3,
      note: null,
    };
    expect(dailyLogSchema.safeParse(log).success).toBe(true);
    expect(dailyLogSchema.safeParse({ ...log, stress: 6 }).success).toBe(false);
    expect(dailyLogSchema.safeParse({ ...log, mood: 2.5 }).success).toBe(false);
    expect(dailyLogSchema.safeParse({ ...log, date: '01/03/2026' }).success).toBe(false);
  });
  test('sync de dailyLog só aceita note null; schema local mantém a nota', () => {
    const log = {
      ...meta,
      date: '2026-03-01',
      stress: 3,
      mood: 3,
      energy: 3,
      sleepQuality: 3,
      note: null,
    };
    const dl = (note: string | null) => ({
      ...change(1),
      entity: 'dailyLog' as const,
      payload: { ...log, note },
    });
    expect(syncChangeSchema.safeParse(dl('texto')).success).toBe(false);
    expect(syncChangeSchema.safeParse(dl(null)).success).toBe(true);
    expect(dailyLogSchema.safeParse({ ...log, note: 'texto' }).success).toBe(true);
  });
  test('checkin normaliza o código de sessão', () => {
    expect(checkinRequest.parse({ sessionCode: ' ab3cde ', clientId: 'c' }).sessionCode).toBe(
      'AB3CDE',
    );
    expect(checkinRequest.safeParse({ sessionCode: 'AB3CD0', clientId: 'c' }).success).toBe(false);
  });
  test('sessionCreate e manualAttendanceUpdate', () => {
    expect(
      sessionCreate.safeParse({ workshop: 3, date: '2026-03-01', location: 'x' }).success,
    ).toBe(false);
    expect(
      sessionCreate.safeParse({ workshop: 1, date: '2026-03-01', location: 'x' }).success,
    ).toBe(true);
    expect(manualAttendanceUpdate.safeParse({ manualCount: -1 }).success).toBe(false);
  });
});
