import { useLiveQuery } from 'dexie-react-hooks';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dayProgress, isEntryMet, toLocalDateKey } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { PageHeader, ProgressRing, toast } from '@nexo/ui';
import { now } from '../../db/clock';
import {
  adjustEntry,
  appendBlock,
  getEntriesForDate,
  getHabits,
  removeBlock,
  setEntry,
} from '../../db';
import { useMediaQuery } from '../../app/useMediaQuery';
import { DaySummary } from './DaySummary';
import { HabitTile, fmtHours } from './HabitTile';
import { MovementHero } from './MovementHero';
import { applyProgressive } from './progressive';
import { getDaySuggestion } from './suggestion';
import { useToday } from './useToday';

// Mesmo limite do xl do Tailwind: a coluna de resumo só existe quando cabe ao lado da grade.
const WIDE_QUERY = '(min-width: 1280px)';
const ANNOUNCE_DELAY_MS = 500;

/** "Terça, 17 de novembro" a partir de `YYYY-MM-DD` (data local). */
function formatLongDate(key: string, t: TFunction): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/-feira$/, '');
  return t('today.dateTitle', {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day: d,
    month: date.toLocaleDateString('pt-BR', { month: 'long' }),
  });
}

function describeEntry(h: Habit, e: HabitEntry | undefined, t: TFunction): string {
  const value = e?.value ?? 0;
  const name = h.name;
  switch (h.type) {
    case 'boolean':
      return t(isEntryMet(h.type, e) ? 'today.announce.booleanOn' : 'today.announce.booleanOff', {
        name,
      });
    case 'counter':
      return t('today.announce.counter', { name, value, target: h.target });
    case 'minutes':
      return t('today.announce.minutes', { name, value, target: h.target });
    case 'range_hours':
      return t('today.announce.hours', { name, value: fmtHours(value) });
  }
}

// Mobilidade, minutos e hábitos próprios ocupam duas colunas.
const isWide = (h: Habit) => h.type === 'minutes' || h.key === null;

export function TodayPage() {
  const { t } = useTranslation();
  const today = useToday();
  const wide = useMediaQuery(WIDE_QUERY);
  const habits = useLiveQuery(getHabits, []);
  const entries = useLiveQuery(() => getEntriesForDate(today), [today]);
  const touched = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Só é chamado nos handlers de toque, nunca durante a renderização.
  const markTouched = useCallback((habitId: string) => {
    touched.current = habitId;
  }, []);

  useEffect(() => {
    applyProgressive(today).catch(() => toast(t('errors.generic')));
  }, [today, t]);

  // Depois de uma mudança feita pela pessoa, anuncia o novo valor (com atraso, para agrupar toques).
  useEffect(() => {
    const habit = habits?.find((h) => h.id === touched.current);
    if (!habit || !entries) return;
    const message = describeEntry(
      habit,
      entries.find((e) => e.habitId === habit.id),
      t,
    );
    const timer = setTimeout(() => setAnnouncement(message), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [habits, entries, t]);

  if (!habits || !entries) return null;
  const active = habits.filter((h) => h.active);
  const { done, total, ratio } = dayProgress(habits, entries, today);
  const percent = Math.round(ratio * 100);
  const byHabit = new Map(entries.map((e) => [e.habitId, e]));
  // A data é lida na hora da escrita: um toque logo após a meia-noite, antes do timer, cai no dia novo.
  const key = () => toLocalDateKey(now());
  const report = () => toast(t('errors.generic'));
  const actions = (h: Habit) => {
    const run = (write: () => Promise<void>) => {
      markTouched(h.id);
      void write().catch(report);
    };
    return {
      onSet: (value: number) => run(() => setEntry(h, key(), value)),
      onAdjust: (delta: number, opts?: { min?: number; max?: number; from?: number }) =>
        run(() => adjustEntry(h, key(), delta, opts)),
      onAppendBlock: (m: number) => run(() => appendBlock(h, key(), m)),
      onRemoveBlock: (i: number) => run(() => removeBlock(h, key(), i)),
    };
  };

  const movement = active.find((h) => h.key === 'movement');
  const others = active.filter((h) => h !== movement);
  // Ordem do DOM = ordem visual: blocos simples primeiro, largos no fim (sem grid-flow-dense).
  const tiles = [...others.filter((h) => !isWide(h)), ...others.filter(isWide)];
  const progressText = t('today.progressText', { done, total });
  const suggestion = t(
    getDaySuggestion({
      movementMinutes: movement ? (byHabit.get(movement.id)?.value ?? 0) : 0,
      movementTarget: movement?.target ?? 0,
      done,
      total,
      hour: now().getHours(),
    }),
  );
  const pendingKeys = active
    .filter((h) => !isEntryMet(h.type, byHabit.get(h.id)))
    .map((h) => h.key);

  return (
    <div className="mx-auto w-full max-w-[1200px] min-[1280px]:grid min-[1280px]:grid-cols-[minmax(0,1fr)_18rem] min-[1280px]:items-start min-[1280px]:gap-10">
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <PageHeader
          eyebrow={t('pages.today')}
          title={formatLongDate(today, t)}
          meta={
            <>
              <span>{progressText}</span>
              <span aria-hidden="true"> · </span>
              <span>{suggestion}</span>
            </>
          }
          aside={
            wide ? undefined : (
              <div
                role="progressbar"
                aria-label={t('today.progressLabel')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={progressText}
              >
                <ProgressRing
                  value={ratio}
                  size={60}
                  stroke={7}
                  label={progressText}
                  className="text-navy dark:text-peach"
                >
                  <span className="text-xs font-extrabold text-text">
                    {done}/{total}
                  </span>
                </ProgressRing>
              </div>
            )
          }
          className="mb-2"
        />
        {movement && (
          <MovementHero habit={movement} entry={byHabit.get(movement.id)} {...actions(movement)} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {tiles.map((h) => (
            <HabitTile
              key={h.id}
              habit={h}
              entry={byHabit.get(h.id)}
              className={isWide(h) ? 'col-span-2' : undefined}
              {...actions(h)}
            />
          ))}
        </div>
        <p className="mt-2 max-w-prose text-sm text-muted">{t('today.footerNotice')}</p>
      </div>
      {wide && (
        <div className="sticky top-10">
          <DaySummary date={today} done={done} total={total} pendingKeys={pendingKeys} />
        </div>
      )}
      <p data-testid="today-live" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
