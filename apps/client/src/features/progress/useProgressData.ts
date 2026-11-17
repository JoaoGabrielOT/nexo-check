import { useLiveQuery } from 'dexie-react-hooks';
import { computeStreak, dayProgress, lastNDateKeys } from '@nexo/shared';
import { getDailyLogsBetween, getEntriesBetween, getHabits } from '../../db';
import { useToday } from '../today/useToday';

export type ProgressRange = 'week' | 'month';

export interface ProgressDay {
  date: string;
  movementMinutes: number;
  stress: number | null;
  ratio: number;
}

/** Janela de histórico usada para streak e conquistas. */
export const HISTORY_DAYS = 60;

const EMPTY = { days: [] as ProgressDay[], streak: { current: 0, best: 0 } };

/** Datas exibidas: últimos 7 dias, ou o mês corrente do dia 1 até hoje. */
export function rangeDates(range: ProgressRange, today: string): string[] {
  if (range === 'week') return lastNDateKeys(today, 7);
  return lastNDateKeys(today, Number(today.slice(8, 10)));
}

export function useProgressData(range: ProgressRange): {
  days: ProgressDay[];
  streak: { current: number; best: number };
} {
  const today = useToday();
  const data = useLiveQuery(async () => {
    const from = lastNDateKeys(today, HISTORY_DAYS)[0] ?? today;
    const [habits, entries, logs] = await Promise.all([
      getHabits(),
      getEntriesBetween(from, today),
      getDailyLogsBetween(from, today),
    ]);
    return { habits, entries, logs };
  }, [today]);

  if (!data) return EMPTY;
  const { habits, entries, logs } = data;
  const movementId = habits.find((h) => h.key === 'movement')?.id;
  const minutes = new Map(
    entries.filter((e) => e.habitId === movementId).map((e) => [e.date, e.value]),
  );
  const stress = new Map(logs.map((l) => [l.date, l.stress]));
  const ratiosByDate = Object.fromEntries(
    lastNDateKeys(today, HISTORY_DAYS).map((d) => [d, dayProgress(habits, entries, d).ratio]),
  );

  return {
    days: rangeDates(range, today).map((date) => ({
      date,
      movementMinutes: minutes.get(date) ?? 0,
      stress: stress.get(date) ?? null,
      ratio: ratiosByDate[date] ?? 0,
    })),
    streak: computeStreak(ratiosByDate, today),
  };
}
