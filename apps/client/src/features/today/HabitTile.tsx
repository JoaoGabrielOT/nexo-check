import { Check, Minus, Plus, X } from 'lucide-react';
import { m, useReducedMotionConfig } from 'motion/react';
import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { isEntryMet } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { QuickAddButton, Tile, cn, type TileTone } from '@nexo/ui';

export interface HabitTileProps {
  habit: Habit;
  entry: HabitEntry | undefined;
  /** Mutações atômicas no banco: nunca recebem valores calculados a partir do estado renderizado. */
  onSet: (value: number) => void;
  onAdjust: (delta: number, opts?: { min?: number; max?: number; from?: number }) => void;
  onAppendBlock: (minutes: number) => void;
  onRemoveBlock: (index: number) => void;
  className?: string;
}

const DEFAULT_SLEEP_HOURS = 7;
const HOUR_STEP = 0.5;
const MAX_HOURS = 24;
const WIDE_STEP = 5;

const TONE: Partial<Record<NonNullable<Habit['key']>, TileTone>> = {
  hydration: 'water',
  sleep: 'sleep',
  active_breaks: 'breaks',
  breathing: 'breathing',
};

export const fmtHours = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

const TAP_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

/** Botão com mola no toque; com movimento reduzido o whileTap nem é passado (ver QuickAddButton). */
export function TapButton({ className, ...props }: ComponentProps<typeof m.button>) {
  const reduce = useReducedMotionConfig();
  return (
    <m.button
      type="button"
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={TAP_SPRING}
      className={cn('cursor-pointer', focusRing, className)}
      {...props}
    />
  );
}

/** Selo "Feito": ícone + texto, para o estado não depender só de cor. */
export function DoneBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs leading-none font-extrabold',
        className,
      )}
    >
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      {t('today.doneBadge')}
    </span>
  );
}

export function BlockChips({
  blocks,
  name,
  onRemove,
  className,
}: {
  blocks: number[];
  name: string;
  onRemove: (index: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (blocks.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {blocks.map((minutes, i) => (
        <li key={`${i}-${minutes}`}>
          <TapButton
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold tabular-nums',
              className,
            )}
            aria-label={t('today.removeBlock', { minutes, name })}
            onClick={() => onRemove(i)}
          >
            {t('today.blockChip', { minutes })}
            <X aria-hidden="true" className="size-4" />
          </TapButton>
        </li>
      ))}
    </ul>
  );
}

const bigNumber = 'text-[2.5rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums';
const roundBtn =
  'flex size-11 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40';
const minusBtn = cn(roundBtn, 'bg-white/75 text-navy dark:bg-white/10 dark:text-text');
const plusBtn = cn(roundBtn, 'bg-navy text-[#f7f5f2] dark:bg-lav2 dark:text-navy');

function counterNames(habit: Habit, t: TFunction) {
  if (habit.key === 'hydration') return { add: t('today.addCup'), remove: t('today.removeCup') };
  if (habit.key === 'active_breaks')
    return { add: t('today.addBreak'), remove: t('today.removeBreak') };
  return {
    add: t('today.increase', { name: habit.name }),
    remove: t('today.decrease', { name: habit.name }),
  };
}

export function HabitTile({
  habit,
  entry,
  onSet,
  onAdjust,
  onAppendBlock,
  onRemoveBlock,
  className,
}: HabitTileProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotionConfig();
  const met = isEntryMet(habit.type, entry);
  const value = entry?.value ?? 0;
  const name = habit.name;
  const tone = (habit.key && TONE[habit.key]) ?? 'plain';
  // A respiração já mostra o check grande; os outros ganham o selo no canto.
  const showBadge = met && habit.type !== 'boolean';
  const names = counterNames(habit, t);

  return (
    <Tile
      tone={tone}
      label={name}
      className={cn(
        'relative min-w-0',
        showBadge && '[&>p:first-child]:pr-20',
        met && 'ring-2 ring-navy/30 ring-inset dark:bg-white/10 dark:ring-white/15',
        className,
      )}
    >
      {showBadge && (
        <DoneBadge className="absolute top-4 right-4 bg-navy text-[#f7f5f2] dark:bg-lav2 dark:text-navy" />
      )}

      {habit.type === 'counter' && (
        <>
          <p className="flex items-baseline">
            <span className={bigNumber}>{value}</span>
            <span className="text-xl font-semibold tabular-nums">/{habit.target}</span>
          </p>
          <p className="line-clamp-2 text-sm font-semibold">
            {habit.key === 'hydration' || habit.key === 'active_breaks'
              ? t(`today.unit.${habit.key}`)
              : habit.description}
          </p>
          <div className="mt-auto flex gap-2 pt-1">
            <TapButton
              className={minusBtn}
              aria-label={names.remove}
              disabled={value <= 0}
              onClick={() => onAdjust(-1)}
            >
              <Minus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </TapButton>
            <TapButton className={plusBtn} aria-label={names.add} onClick={() => onAdjust(1)}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </TapButton>
          </div>
        </>
      )}

      {habit.type === 'boolean' && (
        <>
          <div className="mt-1 flex items-center gap-3">
            <TapButton
              role="checkbox"
              aria-checked={met}
              aria-label={t('today.markDone', { name })}
              onClick={() => onSet(met ? 0 : habit.target)}
              className={cn(
                'flex size-14 shrink-0 items-center justify-center rounded-full border-[2.5px] border-current',
                met &&
                  'border-navy bg-navy text-[#f7f5f2] dark:border-lav2 dark:bg-lav2 dark:text-navy',
              )}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7">
                <m.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: met ? 1 : 0, opacity: met ? 1 : 0 }}
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 28 }
                  }
                />
              </svg>
            </TapButton>
            <span aria-hidden="true" className="text-base leading-tight font-extrabold">
              {met ? t('today.checkDone') : t('today.checkPending')}
            </span>
          </div>
          <p className="mt-auto line-clamp-2 text-sm font-semibold">{habit.description}</p>
        </>
      )}

      {habit.type === 'range_hours' && (
        <>
          <p className="flex items-baseline gap-1">
            <span className={bigNumber}>{entry ? fmtHours(value) : '–'}</span>
            <span className="text-xl font-semibold">h</span>
          </p>
          <p className="text-sm font-semibold">
            {habit.targetMax === null
              ? t('today.hoursTargetMin', { min: habit.target })
              : t('today.hoursTarget', { min: habit.target, max: habit.targetMax })}
          </p>
          <div className="mt-auto flex gap-2 pt-1">
            <TapButton
              className={minusBtn}
              aria-label={t('today.hoursDecrease', { name })}
              onClick={() => onAdjust(-HOUR_STEP, { min: 0, from: DEFAULT_SLEEP_HOURS })}
            >
              <Minus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </TapButton>
            <TapButton
              className={plusBtn}
              aria-label={t('today.hoursIncrease', { name })}
              onClick={() => onAdjust(HOUR_STEP, { max: MAX_HOURS, from: DEFAULT_SLEEP_HOURS })}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </TapButton>
          </div>
        </>
      )}

      {habit.type === 'minutes' && (
        <>
          <p className="text-2xl leading-tight font-extrabold tracking-[-0.03em] tabular-nums">
            {t('today.minutesOf', { value, target: habit.target })}
          </p>
          <p className="text-sm font-semibold text-muted">{habit.description}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <QuickAddButton
              variant="outline"
              aria-label={t('today.addMinutes', { minutes: WIDE_STEP, name })}
              onClick={() => onAppendBlock(WIDE_STEP)}
            >
              +{WIDE_STEP} min
            </QuickAddButton>
            <BlockChips
              blocks={entry?.blocks ?? []}
              name={name}
              onRemove={onRemoveBlock}
              className="border border-current/25"
            />
          </div>
        </>
      )}
    </Tile>
  );
}
