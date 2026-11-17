import { m, useReducedMotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface QuickAddButtonProps {
  onClick: () => void;
  children: ReactNode;
  /** hero: ação principal do bloco herói; outline: herda a cor do texto do bloco. */
  variant?: 'hero' | 'outline';
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

const VARIANTS = {
  hero: 'bg-hero-action text-hero-action-ink hover:brightness-105',
  outline: 'border-2 border-current bg-transparent text-current hover:bg-current/10',
} as const;

const TAP_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

// A mola vem do motion (precisa de <LazyMotion> no app para animar). Com movimento reduzido
// (MotionConfig reducedMotion="user" + preferência do sistema) o whileTap nem é passado.
export function QuickAddButton({
  onClick,
  children,
  variant = 'hero',
  className,
  disabled,
  'aria-label': ariaLabel,
}: QuickAddButtonProps) {
  const reduce = useReducedMotionConfig();
  return (
    <m.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={TAP_SPRING}
      className={cn(
        'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-5 text-base font-extrabold tabular-nums ' +
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl ' +
          'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </m.button>
  );
}
