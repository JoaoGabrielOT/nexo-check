import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

// A área clicável tem 44px de altura; a trilha visual fica dentro do botão.
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex min-h-11 min-w-14 cursor-pointer items-center rounded-full border-2 border-border bg-lav2 p-1 transition-colors ' +
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl ' +
          'data-[state=checked]:bg-navy disabled:cursor-not-allowed disabled:opacity-50 ' +
          'dark:bg-surface dark:data-[state=checked]:bg-lav2',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-6 rounded-full bg-navy data-[state=checked]:translate-x-5 data-[state=checked]:bg-white motion-safe:transition-transform dark:bg-lav2 dark:data-[state=checked]:bg-navy" />
    </SwitchPrimitive.Root>
  );
}
