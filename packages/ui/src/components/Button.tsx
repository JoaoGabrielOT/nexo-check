import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// Contraste AA: branco sobre #c0575a dá ~4,1:1; por isso o danger usa #a8434a (~5,6:1).
export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-extrabold ' +
    'transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl ' +
    'disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-95',
  {
    variants: {
      variant: {
        primary:
          'bg-navy text-white hover:bg-navy/90 dark:bg-lav2 dark:text-navy dark:hover:bg-lav2/90',
        secondary:
          'border-2 border-border bg-transparent text-text hover:bg-lav2/40 dark:hover:bg-surface',
        ghost: 'bg-transparent text-text hover:bg-lav2/40 dark:hover:bg-surface',
        danger: 'bg-[#a8434a] text-white hover:bg-[#933a41]',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
