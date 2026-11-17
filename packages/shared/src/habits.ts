import { PROGRESSIVE_DEFAULT_CEILING } from './constants';
import type { Habit, HabitEntry, HabitType } from './types';

export function createDefaultHabits(now: Date, newId: () => string): Habit[] {
  const updatedAt = now.toISOString();
  const base = { updatedAt, deletedAt: null, active: true, progressive: null } as const;
  const defs: Omit<Habit, 'id' | 'updatedAt' | 'deletedAt' | 'active' | 'order' | 'progressive'>[] =
    [
      {
        key: 'movement',
        name: 'Movimento do dia',
        description: '30 min de movimento leve a moderado, somando blocos ao longo do dia',
        type: 'minutes',
        target: 30,
        targetMax: null,
      },
      {
        key: 'active_breaks',
        name: 'Pausas ativas',
        description: '6 por dia: 1 a cada 1 h sentado',
        type: 'counter',
        target: 6,
        targetMax: null,
      },
      {
        key: 'mobility',
        name: 'Mobilidade / alongamento suave',
        description: '5 a 10 min de mobilidade e alongamento suave',
        type: 'minutes',
        target: 5,
        targetMax: null,
      },
      {
        key: 'breathing',
        name: 'Respiração de recuperação',
        description: '1 sessão de 3 a 5 min',
        type: 'boolean',
        target: 1,
        targetMax: null,
      },
      {
        key: 'sleep',
        name: 'Sono',
        description: 'De 7 a 9 h de sono',
        type: 'range_hours',
        target: 7,
        targetMax: 9,
      },
      {
        key: 'hydration',
        name: 'Hidratação',
        description: '8 copos de água ao longo do dia',
        type: 'counter',
        target: 8,
        targetMax: null,
      },
    ];
  return defs.map((def, order) => ({
    ...base,
    ...def,
    id: newId(),
    order,
    progressive:
      def.key === 'movement' ? { enabled: false, ceiling: PROGRESSIVE_DEFAULT_CEILING } : null,
  }));
}

/** Cumprimento usa sempre os snapshots da entry, nunca a meta atual do hábito. */
export function isEntryMet(habitType: HabitType, entry: HabitEntry | undefined): boolean {
  if (!entry || entry.deletedAt !== null) return false;
  if (habitType === 'range_hours') {
    const max = entry.targetMaxSnapshot ?? Infinity;
    return entry.value >= entry.targetSnapshot && entry.value <= max;
  }
  return entry.value >= entry.targetSnapshot;
}

export function dayProgress(
  habits: Habit[],
  entries: HabitEntry[],
  date: string,
): { done: number; total: number; ratio: number } {
  const active = habits.filter((h) => h.active && h.deletedAt === null);
  const byHabit = new Map<string, HabitEntry>();
  for (const e of entries) if (e.date === date) byHabit.set(e.habitId, e);
  const done = active.filter((h) => isEntryMet(h.type, byHabit.get(h.id))).length;
  const total = active.length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export function makeEntry(
  habit: Habit,
  date: string,
  value: number,
  blocks: number[],
  now: Date,
): HabitEntry {
  return {
    id: `${habit.id}:${date}`,
    updatedAt: now.toISOString(),
    deletedAt: null,
    habitId: habit.id,
    date,
    value,
    blocks,
    targetSnapshot: habit.target,
    targetMaxSnapshot: habit.targetMax,
  };
}
