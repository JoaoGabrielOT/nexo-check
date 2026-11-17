import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ProgressRingProps {
  /** Fração concluída, de 0 a 1 (valores fora disso são limitados). */
  value: number;
  size?: number;
  stroke?: number;
  /** Nome acessível do anel, ex.: "4 de 6 hábitos feitos". */
  label: string;
  /** Conteúdo visual no centro (ex.: "4/6"); o nome acessível já vem de `label`. */
  children?: ReactNode;
  className?: string;
}

// O arco usa currentColor e a trilha o mesmo tom com baixa opacidade: a cor vem do text-* do pai.
export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  label,
  children,
  className,
}: ProgressRingProps) {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        <circle
          data-ring="value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 motion-safe:ease-out"
        />
      </svg>
      {children !== undefined && (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center tabular-nums">
          {children}
        </span>
      )}
    </div>
  );
}
