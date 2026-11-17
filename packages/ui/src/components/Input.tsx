import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-full border-2 border-border bg-surface px-4 py-2 text-text placeholder:text-muted ' +
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl ' +
          'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
