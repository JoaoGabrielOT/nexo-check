import { Toaster as Sonner, toast } from 'sonner';
import type { ComponentProps } from 'react';

export function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      toastOptions={{
        classNames: { toast: '!rounded-card !bg-surface !text-text !border-border !font-sans' },
      }}
      {...props}
    />
  );
}

export { toast };
