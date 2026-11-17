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
const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-transparent border-border dark:bg-surface',
  1: 'bg-lav2 border-lav2 dark:bg-lav/40 dark:border-lav/40',
  2: 'bg-lav border-lav dark:bg-lav dark:border-lav',
  3: 'bg-navy border-navy dark:bg-white dark:border-white',
};

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
    <div role="group" aria-label={t('progress.heatmapTitle')} className="grid grid-cols-7 gap-1.5">
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
              'flex aspect-square items-center justify-center rounded-md border-2 text-xs font-bold',
              LEVEL_CLASS[heatLevel(ratio)],
              heatLevel(ratio) === 3 ? 'text-white dark:text-navy' : 'text-text',
            )}
          >
            <span aria-hidden="true">{Number(date.slice(8, 10))}</span>
          </div>
        );
      })}
    </div>
  );
}
