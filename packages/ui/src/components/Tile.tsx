import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type TileTone = 'water' | 'sleep' | 'breaks' | 'breathing' | 'plain';

// Classes completas (não montadas por template) para o Tailwind enxergar cada uma.
const TONES: Record<TileTone, { tile: string; label: string }> = {
  water: { tile: 'bg-tile-water', label: 'text-tile-label-water' },
  sleep: { tile: 'bg-tile-sleep', label: 'text-tile-label-sleep' },
  breaks: { tile: 'bg-tile-breaks', label: 'text-tile-label-breaks' },
  breathing: { tile: 'bg-tile-breathing', label: 'text-tile-label-breathing' },
  plain: {
    tile: 'bg-tile-plain border-border/15 dark:border-tile-edge',
    label: 'text-tile-label-plain',
  },
};

export interface TileProps {
  tone: TileTone;
  label: string;
  children: ReactNode;
  className?: string;
}

// O rótulo visível repete o aria-label da seção; fica oculto para não ser lido duas vezes.
export function Tile({ tone, label, children, className }: TileProps) {
  const t = TONES[tone];
  return (
    <section
      aria-label={label}
      className={cn(
        'flex flex-col gap-3 rounded-tile border border-tile-edge p-5 text-tile-ink grain dark:bg-none',
        t.tile,
        className,
      )}
    >
      <p aria-hidden="true" className={cn('eyebrow', t.label)}>
        {label}
      </p>
      {children}
    </section>
  );
}
