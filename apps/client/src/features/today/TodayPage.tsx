import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dayProgress } from '@nexo/shared';
import type { Habit } from '@nexo/shared';
import { Panel } from '@nexo/ui';
import { getEntriesForDate, getHabits, setEntry } from '../../db';
import { HabitRow } from './HabitRow';
import { applyProgressive } from './progressive';
import { useToday } from './useToday';

export function TodayPage() {
  const { t } = useTranslation();
  const today = useToday();
  const habits = useLiveQuery(getHabits, []);
  const entries = useLiveQuery(() => getEntriesForDate(today), [today]);

  useEffect(() => {
    void applyProgressive(today);
  }, [today]);

  if (!habits || !entries) return null;
  const active = habits.filter((h) => h.active);
  const { done, total, ratio } = dayProgress(habits, entries, today);
  const percent = Math.round(ratio * 100);
  const byHabit = new Map(entries.map((e) => [e.habitId, e]));
  const set = (h: Habit) => (value: number, blocks?: number[]) =>
    void setEntry(h, today, value, blocks);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.today')}</h1>
      <Panel>
        <p className="mb-2 font-extrabold">{t('today.progressText', { done, total })}</p>
        <div
          role="progressbar"
          aria-label={t('today.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-3 overflow-hidden rounded-full bg-white/70 dark:bg-bg"
        >
          <div
            className="h-full rounded-full bg-navy motion-safe:transition-[width] dark:bg-lav2"
            style={{ width: `${percent}%` }}
          />
        </div>
      </Panel>
      {active.map((h) => (
        <HabitRow key={h.id} habit={h} entry={byHabit.get(h.id)} onSet={set(h)} />
      ))}
      <p className="text-center text-sm opacity-80">{t('today.footerNotice')}</p>
    </div>
  );
}
