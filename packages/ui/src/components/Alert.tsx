import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="note"
      className={cn(
        'rounded-r-[20px] border-l-8 border-rd bg-surface px-5 py-4 text-text',
        className,
      )}
      {...props}
    />
  );
}
