import type { TileTone } from '@nexo/ui';

// O guia alterna as tintas dos blocos de hábito; o artigo repete a tinta do bloco de onde veio.
const GUIDE_TONES = ['water', 'sleep', 'breaks', 'breathing'] as const satisfies TileTone[];

export type GuideTone = (typeof GUIDE_TONES)[number];

export const guideTone = (index: number): GuideTone =>
  GUIDE_TONES[index % GUIDE_TONES.length] ?? 'water';

// Classes completas (não montadas por template) para o Tailwind enxergar cada uma.
export const TONE_BG: Record<GuideTone, string> = {
  water: 'bg-tile-water',
  sleep: 'bg-tile-sleep',
  breaks: 'bg-tile-breaks',
  breathing: 'bg-tile-breathing',
};

export const TONE_LABEL: Record<GuideTone, string> = {
  water: 'text-tile-label-water',
  sleep: 'text-tile-label-sleep',
  breaks: 'text-tile-label-breaks',
  breathing: 'text-tile-label-breathing',
};

export const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';
