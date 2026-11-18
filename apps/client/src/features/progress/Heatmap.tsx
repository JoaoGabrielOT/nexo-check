import { useTranslation } from 'react-i18next';
import { cn } from '@nexo/ui';

export interface HeatmapDay {
  date: string;
  ratio: number;
}

export type HeatLevel = 0 | 1 | 2 | 3;

export function heatLevel(ratio: number): HeatLevel {
  if (ratio >= 1) return 3;
  if (ratio >= 0.5) return 2;
  return ratio > 0 ? 1 : 0;
}

// Lavanda (pouco) até navy (completo); no escuro o sentido se mantém: mais claro = mais cumprido.
// Dia vazio é só um contorno lavanda: nada de vermelho nem de cor de alerta.
const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-transparent border-lav dark:border-lav2/45',
  1: 'bg-lav2 border-lav2 dark:bg-lav/40 dark:border-transparent',
  2: 'bg-lav border-lav',
  3: 'bg-navy border-navy dark:bg-peach dark:border-peach',
};
const LEVEL_TEXT: Record<HeatLevel, string> = {
  0: 'text-text',
  1: 'text-text',
  2: 'text-navy',
  3: 'text-white dark:text-navy',
};
const LEVELS: HeatLevel[] = [0, 1, 2, 3];

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAY_BASE = new Date(2024, 0, 1); // uma segunda-feira

const weekday = (i: number, style: 'long' | 'narrow') =>
  new Date(WEEKDAY_BASE.getFullYear(), 0, 1 + i)
    .toLocaleDateString('pt-BR', { weekday: style })
    .replace(/-feira$/, '');

/** Grade do mês de `today` (semanas começando na segunda); dias futuros ficam vazios. */
export function Heatmap({ days, today }: { days: HeatmapDay[]; today: string }) {
  const { t } = useTranslation();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const ratios = new Map(days.map((d) => [d.date, d.ratio]));

  const cells = [
    ...Array.from({ length: offset }, (_, i) => ({ key: `pad-${i}`, date: null })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      key: `d-${i + 1}`,
      date: `${year}-${pad(month)}-${pad(i + 1)}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={t('progress.heatmapTitle')}
        className="grid grid-cols-7 gap-1.5"
      >
        {Array.from({ length: 7 }, (_, i) => (
          <abbr
            key={i}
            title={weekday(i, 'long')}
            className="text-center text-xs font-extrabold text-muted no-underline"
          >
            {weekday(i, 'narrow').toUpperCase()}
          </abbr>
        ))}
        {cells.map(({ key, date }) => {
          if (date === null || date > today) return <div key={key} aria-hidden="true" />;
          const ratio = ratios.get(date) ?? 0;
          const level = heatLevel(ratio);
          const label = t('progress.heatmapLabel', {
            date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
            percent: Math.floor(ratio * 100 + 1e-9),
          });
          return (
            <div
              key={key}
              role="img"
              aria-label={label}
              title={label}
              className={cn(
                'flex aspect-square items-center justify-center rounded-lg border-2 text-xs font-bold tabular-nums',
                LEVEL_CLASS[level],
                LEVEL_TEXT[level],
              )}
            >
              <span aria-hidden="true">{Number(date.slice(8, 10))}</span>
            </div>
          );
        })}
      </div>
      <ul
        aria-label={t('progress.heatmapLegend')}
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted"
      >
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('size-4 rounded-[5px] border-2', LEVEL_CLASS[level])}
            />
            {t(`progress.heatLevel.${level}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
