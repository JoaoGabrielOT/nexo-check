import { Minus, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isEntryMet } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { Card, cn } from '@nexo/ui';

export interface HabitRowProps {
  habit: Habit;
  entry: HabitEntry | undefined;
  onSet: (value: number, blocks?: number[]) => void;
}

const MINUTE_STEPS = [5, 10, 15] as const;
const DEFAULT_SLEEP_HOURS = 7;
const HOUR_STEP = 0.5;
const MAX_HOURS = 24;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtHours = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';
const stepBtn = cn(
  'flex size-11 items-center justify-center rounded-full border-2 border-border text-text transition-colors hover:bg-lav2/40 disabled:pointer-events-none disabled:opacity-40 motion-safe:active:scale-95 dark:hover:bg-surface',
  focusRing,
);

export function HabitRow({ habit, entry, onSet }: HabitRowProps) {
  const { t } = useTranslation();
  const met = isEntryMet(habit.type, entry);
  const value = entry?.value ?? 0;
  const blocks = entry?.blocks ?? [];
  const name = habit.name;

  return (
    <Card
      className={cn(
        'flex flex-col gap-3 border-2 border-transparent',
        met && 'border-navy motion-safe:animate-[nexo-pop_300ms_ease-out] dark:border-lav2',
      )}
      data-met={met}
    >
      <div>
        <h2 className="text-lg font-extrabold">{name}</h2>
        <p className="text-sm opacity-80">{habit.description}</p>
        {habit.key === 'movement' && (
          <p className="text-sm font-semibold">{t('today.movementHint')}</p>
        )}
      </div>

      {habit.type === 'boolean' && (
        <input
          type="checkbox"
          className="size-11 accent-navy dark:accent-lav2"
          aria-label={t('today.markDone', { name })}
          checked={value >= habit.target}
          onChange={(e) => onSet(e.target.checked ? habit.target : 0)}
        />
      )}

      {habit.type === 'counter' && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            className={stepBtn}
            aria-label={t('today.decrease', { name })}
            disabled={value <= 0}
            onClick={() => onSet(Math.max(0, value - 1))}
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
          <span className="min-w-16 text-center text-xl font-extrabold" aria-live="polite">
            {t('today.counterProgress', { value, target: habit.target })}
          </span>
          <button
            type="button"
            className={stepBtn}
            aria-label={t('today.increase', { name })}
            onClick={() => onSet(value + 1)}
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}

      {habit.type === 'minutes' && (
        <div className="flex flex-col gap-3">
          <span className="text-xl font-extrabold" aria-live="polite">
            {t('today.minutesProgress', { value, target: habit.target })}
          </span>
          <div className="flex flex-wrap gap-2">
            {MINUTE_STEPS.map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  'min-h-11 min-w-11 rounded-full bg-navy px-4 font-extrabold text-white motion-safe:active:scale-95 dark:bg-lav2 dark:text-navy',
                  focusRing,
                )}
                aria-label={t('today.addMinutes', { minutes: m, name })}
                onClick={() => {
                  const next = [...blocks, m];
                  onSet(sum(next), next);
                }}
              >
                +{m}
              </button>
            ))}
          </div>
          {blocks.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {blocks.map((m, i) => (
                <li key={`${i}-${m}`}>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-border px-3 text-sm font-semibold',
                      focusRing,
                    )}
                    aria-label={t('today.removeBlock', { minutes: m, name })}
                    onClick={() => {
                      const next = blocks.filter((_, j) => j !== i);
                      onSet(sum(next), next);
                    }}
                  >
                    {t('today.blockChip', { minutes: m })}
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {habit.type === 'range_hours' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={stepBtn}
              aria-label={t('today.hoursDecrease', { name })}
              onClick={() => onSet(Math.max(0, (entry ? value : DEFAULT_SLEEP_HOURS) - HOUR_STEP))}
            >
              <Minus aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-20 text-center text-xl font-extrabold" aria-live="polite">
              {entry ? t('today.hours', { value: fmtHours(value) }) : t('today.hoursEmpty')}
            </span>
            <button
              type="button"
              className={stepBtn}
              aria-label={t('today.hoursIncrease', { name })}
              onClick={() =>
                onSet(Math.min(MAX_HOURS, (entry ? value : DEFAULT_SLEEP_HOURS) + HOUR_STEP))
              }
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
          <p className="text-sm opacity-80">
            {habit.targetMax === null
              ? t('today.hoursTargetMin', { min: habit.target })
              : t('today.hoursTarget', { min: habit.target, max: habit.targetMax })}
          </p>
        </div>
      )}
    </Card>
  );
}
