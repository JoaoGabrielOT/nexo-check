import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Raios do tema (--radius-card/--radius-panel) entram no grupo `rounded`,
// para a className do consumidor poder sobrescrevê-los.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['card', 'panel'] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
