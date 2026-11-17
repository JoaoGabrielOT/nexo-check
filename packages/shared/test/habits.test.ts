import { createDefaultHabits, isEntryMet, dayProgress, makeEntry } from '../src/habits';
import type { Habit, HabitEntry } from '../src/types';

let n = 0;
const newId = () => `id-${++n}`;
const now = new Date(2026, 0, 5, 10, 0);

function entry(over: Partial<HabitEntry>): HabitEntry {
  return {
    id: 'h:2026-01-05',
    updatedAt: now.toISOString(),
    deletedAt: null,
    habitId: 'h',
    date: '2026-01-05',
    value: 0,
    blocks: [],
    targetSnapshot: 1,
    targetMaxSnapshot: null,
    ...over,
  };
}

describe('createDefaultHabits', () => {
  const habits = createDefaultHabits(now, newId);
  test('6 hábitos na ordem e com metas do design', () => {
    expect(habits.map((h) => [h.key, h.type, h.target, h.targetMax])).toEqual([
      ['movement', 'minutes', 30, null],
      ['active_breaks', 'counter', 6, null],
      ['mobility', 'minutes', 5, null],
      ['breathing', 'boolean', 1, null],
      ['sleep', 'range_hours', 7, 9],
      ['hydration', 'counter', 8, null],
    ]);
    expect(habits.map((h) => h.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(habits.every((h) => h.active && h.deletedAt === null)).toBe(true);
    expect(new Set(habits.map((h) => h.id)).size).toBe(6);
  });
  test('movimento tem modo progressivo desligado com teto 30', () => {
    expect(habits[0]?.progressive).toEqual({ enabled: false, ceiling: 30 });
    expect(habits.slice(1).every((h) => h.progressive === null)).toBe(true);
  });
  test('textos em português', () => {
    expect(habits[1]?.description).toContain('1 a cada 1 h sentado');
    expect(habits[2]?.description).toContain('5 a 10 min');
    expect(habits[3]?.description).toContain('1 sessão de 3 a 5 min');
    expect(habits[2]?.name).toBe('Mobilidade / alongamento suave');
  });
});

describe('isEntryMet', () => {
  test('boolean', () => {
    expect(isEntryMet('boolean', entry({ value: 1, targetSnapshot: 1 }))).toBe(true);
    expect(isEntryMet('boolean', entry({ value: 0, targetSnapshot: 1 }))).toBe(false);
  });
  test('counter', () => {
    expect(isEntryMet('counter', entry({ value: 5, targetSnapshot: 6 }))).toBe(false);
    expect(isEntryMet('counter', entry({ value: 6, targetSnapshot: 6 }))).toBe(true);
  });
  test('minutes', () => {
    expect(isEntryMet('minutes', entry({ value: 30, blocks: [10, 20], targetSnapshot: 30 }))).toBe(
      true,
    );
    expect(isEntryMet('minutes', entry({ value: 25, blocks: [10, 15], targetSnapshot: 30 }))).toBe(
      false,
    );
  });
  test('range_hours', () => {
    const r = { targetSnapshot: 7, targetMaxSnapshot: 9 };
    expect(isEntryMet('range_hours', entry({ value: 6.5, ...r }))).toBe(false);
    expect(isEntryMet('range_hours', entry({ value: 8, ...r }))).toBe(true);
    expect(isEntryMet('range_hours', entry({ value: 9.5, ...r }))).toBe(false);
    expect(isEntryMet('range_hours', entry({ value: 7, ...r }))).toBe(true);
    expect(isEntryMet('range_hours', entry({ value: 9, ...r }))).toBe(true);
  });
  test('sem registro ou registro apagado', () => {
    expect(isEntryMet('counter', undefined)).toBe(false);
    expect(
      isEntryMet('counter', entry({ value: 9, targetSnapshot: 6, deletedAt: now.toISOString() })),
    ).toBe(false);
  });
});

describe('makeEntry e dayProgress', () => {
  const base: Habit = {
    id: 'h',
    updatedAt: now.toISOString(),
    deletedAt: null,
    key: 'movement',
    name: 'x',
    description: 'y',
    type: 'minutes',
    target: 30,
    targetMax: null,
    active: true,
    order: 0,
    progressive: null,
  };

  test('makeEntry guarda cópia de blocks', () => {
    const blocks = [10, 5];
    const e = makeEntry(base, '2026-01-05', 15, blocks, now);
    blocks.push(99);
    expect(e.blocks).toEqual([10, 5]);
  });

  test('makeEntry copia snapshots e monta o id', () => {
    const e = makeEntry(base, '2026-01-05', 25, [25], now);
    expect(e).toMatchObject({
      id: 'h:2026-01-05',
      habitId: 'h',
      date: '2026-01-05',
      value: 25,
      blocks: [25],
      targetSnapshot: 30,
      targetMaxSnapshot: null,
      updatedAt: now.toISOString(),
      deletedAt: null,
    });
  });

  test('mudar a meta não altera dia antigo (usa snapshot)', () => {
    const habit = { ...base };
    const e = makeEntry(habit, '2026-01-05', 25, [25], now);
    expect(dayProgress([habit], [e], '2026-01-05').done).toBe(0);
    habit.target = 20;
    expect(dayProgress([habit], [e], '2026-01-05')).toEqual({ done: 0, total: 1, ratio: 0 });
  });

  test('só ativos e não deletados; ignora outras datas', () => {
    const hs: Habit[] = Array.from({ length: 8 }, (_, i) => ({
      ...base,
      id: `h${i}`,
      type: 'boolean',
      target: 1,
      active: i !== 6,
      deletedAt: i === 7 ? now.toISOString() : null,
    }));
    const es = [0, 1, 2, 6, 7].map((i) => makeEntry(hs[i] as Habit, '2026-01-05', 1, [], now));
    es.push(makeEntry(hs[3] as Habit, '2026-01-04', 1, [], now));
    expect(dayProgress(hs.slice(0, 6), es, '2026-01-05')).toEqual({
      done: 3,
      total: 6,
      ratio: 0.5,
    });
    expect(dayProgress(hs, es, '2026-01-05')).toEqual({ done: 3, total: 6, ratio: 0.5 });
  });

  test('sem hábitos ativos: ratio 0', () => {
    expect(dayProgress([], [], '2026-01-05')).toEqual({ done: 0, total: 0, ratio: 0 });
  });
});
