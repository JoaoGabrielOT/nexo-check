import * as RadioGroup from '@radix-ui/react-radio-group';
import { useId } from 'react';
import { cn } from '../lib/cn';

export type ScaleValue = 1 | 2 | 3 | 4 | 5;

const OPTIONS: ScaleValue[] = [1, 2, 3, 4, 5];

export interface ScalePickerProps {
  label: string;
  value: ScaleValue | null;
  onChange: (value: ScaleValue) => void;
  lowLabel?: string;
  highLabel?: string;
  className?: string;
}

export function ScalePicker({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  className,
}: ScalePickerProps) {
  const labelId = useId();
  const lowId = `${labelId}-low`;
  const highId = `${labelId}-high`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={labelId} className="font-extrabold">
        {label}
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={value === null ? '' : String(value)}
        onValueChange={(v) => onChange(Number(v) as ScaleValue)}
        orientation="horizontal"
        className="flex gap-2"
      >
        {OPTIONS.map((n) => (
          <RadioGroup.Item
            key={n}
            value={String(n)}
            aria-label={String(n)}
            aria-describedby={
              n === 1 && lowLabel ? lowId : n === 5 && highLabel ? highId : undefined
            }
            className={
              'min-h-11 min-w-11 cursor-pointer rounded-full border-2 border-border bg-transparent font-extrabold text-text transition-colors ' +
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl ' +
              'data-[state=checked]:bg-navy data-[state=checked]:text-white ' +
              'dark:data-[state=checked]:bg-lav2 dark:data-[state=checked]:text-navy'
            }
          >
            {n}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-sm text-muted">
          <span id={lowId}>{lowLabel}</span>
          <span id={highId}>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
