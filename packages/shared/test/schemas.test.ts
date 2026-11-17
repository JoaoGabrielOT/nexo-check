import {
  checkinRequest,
  manualAttendanceUpdate,
  sessionCreate,
  syncPushRequest,
} from '../src/schemas/api';
import { dailyLogSchema, habitEntrySchema, syncChangeSchema } from '../src/schemas/entities';

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
