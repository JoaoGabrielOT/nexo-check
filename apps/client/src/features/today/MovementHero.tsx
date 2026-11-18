import { useTranslation } from 'react-i18next';
import { isEntryMet } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { QuickAddButton } from '@nexo/ui';
import { BlockChips, DoneBadge } from './HabitTile';

export interface MovementHeroProps {
  habit: Habit;
  entry: HabitEntry | undefined;
  onAppendBlock: (minutes: number) => void;
  onRemoveBlock: (index: number) => void;
}

const MINUTE_STEPS = [5, 10, 15] as const;

// Bloco herói: o movimento leve a moderado é o protagonista da tela. O círculo é só decoração.
export function MovementHero({ habit, entry, onAppendBlock, onRemoveBlock }: MovementHeroProps) {
  const { t } = useTranslation();
  const value = entry?.value ?? 0;
  const blocks = entry?.blocks ?? [];
  const met = isEntryMet(habit.type, entry);
  const percent = habit.target > 0 ? Math.min(100, (value / habit.target) * 100) : 0;

  return (
    <section
      aria-label={habit.name}
      className="relative isolate overflow-hidden rounded-hero bg-hero p-6 text-hero-ink sm:p-8"
    >
      <span
        aria-hidden="true"
        className="absolute -top-16 -right-14 -z-10 size-44 rounded-full bg-bl sm:-top-24 sm:-right-16 sm:size-64 dark:bg-or"
      />
      <div className="flex min-h-7 items-center gap-3">
        <p aria-hidden="true" className="eyebrow">
          {habit.name}
        </p>
        {met && <DoneBadge className="bg-hero-action text-hero-action-ink" />}
      </div>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[4.25rem] leading-[0.9] font-extrabold tracking-[-0.05em] tabular-nums sm:text-[5.5rem]">
              {value}
            </span>
            <span className="text-lg font-semibold">
              {t('today.movementOf', { target: habit.target })}
            </span>
          </p>
          <p className="mt-3 text-sm font-semibold text-balance">
            {t('today.movementLine', { count: blocks.length })}
          </p>
          <div aria-hidden="true" className="mt-4 h-2 w-full max-w-xs rounded-full bg-hero-ink/20">
            <div
              className="h-full rounded-full bg-hero-action motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {MINUTE_STEPS.map((minutes) => (
            <QuickAddButton
              key={minutes}
              aria-label={t('today.addMinutes', { minutes, name: habit.name })}
              onClick={() => onAppendBlock(minutes)}
            >
              +{minutes}
            </QuickAddButton>
          ))}
        </div>
      </div>

      {blocks.length > 0 && (
        <div className="mt-5">
          <BlockChips
            blocks={blocks}
            name={habit.name}
            onRemove={onRemoveBlock}
            className="bg-hero-ink/12 hover:bg-hero-ink/20"
          />
        </div>
      )}
    </section>
  );
}
