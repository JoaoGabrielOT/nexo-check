import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  /** Rótulo pequeno acima do título (ex.: dia da semana ou seção). */
  eyebrow?: string;
  title: string;
  /** Linha de apoio abaixo do título (ex.: "4 de 6 hábitos"). */
  meta?: ReactNode;
  /** Elemento à direita, alinhado à base do título (ex.: anel de progresso). */
  aside?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, meta, aside, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-muted">{eyebrow}</p>}
        <h1 className="text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">
          {title}
        </h1>
        {meta && <div className="mt-3 text-sm font-semibold text-muted">{meta}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
