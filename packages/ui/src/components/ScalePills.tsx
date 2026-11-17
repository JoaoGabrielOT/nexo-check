import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import type { ScaleValue } from './ScalePicker';

export interface ScalePillsProps {
  label: string;
  value: ScaleValue | null;
  onChange: (value: ScaleValue) => void;
  /** Palavra de cada ponto, do 1 ao 5 (ex.: "Muito baixo" … "Muito alto"). */
  words: [string, string, string, string, string];
  className?: string;
}

const OPTIONS: ScaleValue[] = [1, 2, 3, 4, 5];

// Altura e tom crescem com o valor; a palavra e o número sempre aparecem (não depende só de cor).
// Claro: lavanda cada vez mais forte com texto navy. Escuro: pêssego translúcido cada vez mais forte.
const PILL = [
  'h-14 bg-lav2/35 dark:bg-peach/10',
  'h-16 bg-lav2/60 dark:bg-peach/16',
  'h-[4.5rem] bg-lav2/85 dark:bg-peach/24',
  'h-20 bg-lav2 dark:bg-peach/32',
  'h-[5.5rem] bg-lav dark:bg-peach/40',
];

const NEXT: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

// Radiogroup próprio (padrão APG): uma parada de tabulação, setas movem foco e seleção com volta.
export function ScalePills({ label, value, onChange, words, className }: ScalePillsProps) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const n = OPTIONS[index];
    if (n === undefined) return;
    onChange(n);
    refs.current[index]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let target: number | null = null;
    if (e.key in NEXT) target = (index + (NEXT[e.key] ?? 0) + OPTIONS.length) % OPTIONS.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = OPTIONS.length - 1;
    if (target === null) return;
    e.preventDefault();
    select(target);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span id={labelId} className="font-extrabold">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex max-w-xl items-end gap-2">
        {OPTIONS.map((n, i) => {
          const checked = value === n;
          const word = words[i];
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${n} — ${word}`}
              tabIndex={checked || (value === null && i === 0) ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={
                'group flex min-w-11 flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-[20px] p-0.5 text-text ' +
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl'
              }
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex w-full items-center justify-center rounded-full text-xl font-extrabold tabular-nums text-navy dark:text-text',
                  'motion-safe:transition-colors group-hover:ring-2 group-hover:ring-current/25',
                  PILL[i],
                  checked && 'bg-navy text-[#f7f5f2] dark:bg-peach dark:text-navy',
                )}
              >
                {n}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'min-h-8 text-center text-xs leading-tight text-balance',
                  checked ? 'font-extrabold' : 'font-semibold text-muted',
                )}
              >
                {word}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
