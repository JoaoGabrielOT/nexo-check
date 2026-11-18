import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@nexo/ui';

export interface NumberStepperProps {
  /** Nome acessível do conjunto (ex.: "Meta de Água"). */
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  min: number;
  max: number;
  format: (n: number) => string;
  className?: string;
}

const roundBtn =
  'grid size-11 cursor-pointer place-items-center rounded-full border-2 border-text/40 text-text transition-colors hover:bg-text/8 ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl disabled:cursor-not-allowed disabled:opacity-40';

export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format,
  className,
}: NumberStepperProps) {
  const { t } = useTranslation();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        className={roundBtn}
        aria-label={t('settings.habits.decrease', { what: label })}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus aria-hidden="true" className="size-4" strokeWidth={3} />
      </button>
      <span className="min-w-20 text-center text-sm font-extrabold tabular-nums">
        {format(value)}
      </span>
      <button
        type="button"
        className={roundBtn}
        aria-label={t('settings.habits.increase', { what: label })}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={3} />
      </button>
    </div>
  );
}
