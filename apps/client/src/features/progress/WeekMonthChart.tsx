import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProgressDay, ProgressRange } from './useProgressData';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const dd = (date: string) => date.slice(8, 10);
const ddmm = (date: string) => `${dd(date)}/${date.slice(5, 7)}`;

// Barras navy no claro e lavanda no escuro, laranja só na barra de hoje; estresse em rosa-tijolo
// (clareado no escuro). As cores vêm de variáveis CSS para trocar de tema sem re-renderizar.
const PALETTE =
  '[--chart-bar:#1d1a5c] [--chart-line:#c0575a] dark:[--chart-bar:#cfcbe3] dark:[--chart-line:#e3868a]';
const BAR = 'var(--chart-bar)';
const LINE = 'var(--chart-line)';
const TODAY = 'var(--color-or)';
const TICK = { fill: 'var(--color-muted)', fontSize: 12, fontWeight: 600 };

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  index?: number;
  value?: unknown;
}

export function WeekMonthChart({
  days,
  range,
  today,
}: {
  days: ProgressDay[];
  range: ProgressRange;
  today: string;
}) {
  const { t } = useTranslation();
  const [animate] = useState(() => !prefersReducedMotion());
  const tick = range === 'week' ? ddmm : dd;
  const todayIndex = days.findIndex((d) => d.date === today);
  const lastStress = days.findLastIndex((d) => d.stress !== null);

  // Rótulos diretos: minutos só na barra de hoje e o valor só no último ponto de estresse.
  const barLabel = ({ x, y, width, index, value }: LabelProps) => {
    if (index !== todayIndex || !value) return null;
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Number(y) - 6}
        textAnchor="middle"
        fill="var(--color-text)"
        fontSize={12}
        fontWeight={800}
      >
        {t('progress.barLabel', { value })}
      </text>
    );
  };
  const stressLabel = ({ x, y, index, value }: LabelProps) => {
    if (index !== lastStress || value === null || value === undefined) return null;
    const atEnd = index > days.length / 2;
    return (
      <text
        x={Number(x) + (atEnd ? -8 : 8)}
        y={Number(y) - 10}
        textAnchor={atEnd ? 'end' : 'start'}
        fill={LINE}
        fontSize={12}
        fontWeight={800}
      >
        {t('progress.stressLabel', { value })}
      </text>
    );
  };

  return (
    <div className={PALETTE}>
      <div
        className="mb-1 flex justify-between gap-2 text-xs font-semibold text-muted"
        aria-hidden="true"
      >
        <span>{t('progress.axisMinutes')}</span>
        <span className="text-right">{t('progress.axisStress')}</span>
      </div>
      <div className="h-64 w-full sm:h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            accessibilityLayer={false}
            data={days}
            margin={{ top: 24, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-text)" strokeOpacity={0.1} />
            <XAxis
              dataKey="date"
              tickFormatter={tick}
              interval="preserveStartEnd"
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} width={36} tick={TICK} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="stress"
              orientation="right"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              width={28}
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="movementMinutes"
              fill={BAR}
              radius={[8, 8, 3, 3]}
              maxBarSize={36}
              isAnimationActive={animate}
            >
              {days.map((d) => (
                <Cell key={d.date} fill={d.date === today ? TODAY : BAR} />
              ))}
              <LabelList dataKey="movementMinutes" content={barLabel} />
            </Bar>
            <Line
              yAxisId="stress"
              dataKey="stress"
              stroke={LINE}
              strokeWidth={2.5}
              dot={{ r: 4, fill: LINE, stroke: 'var(--color-bg)', strokeWidth: 2 }}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={animate}
            >
              <LabelList dataKey="stress" content={stressLabel} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold" aria-hidden="true">
        <li className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="1" y="3" width="14" height="12" rx="3" fill={BAR} />
          </svg>
          {t('progress.axisMinutes')}
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="1" y="3" width="14" height="12" rx="3" fill={TODAY} />
          </svg>
          {t('progress.today')}
        </li>
        <li className="flex items-center gap-2">
          <svg width="24" height="16" viewBox="0 0 24 16">
            <line x1="0" y1="8" x2="24" y2="8" stroke={LINE} strokeWidth="2.5" />
            <circle cx="12" cy="8" r="4.5" fill={LINE} />
          </svg>
          {t('progress.axisStress')}
        </li>
      </ul>
      {/* sr-only no div: uma tabela ignora width 1px e esticaria a página no celular. */}
      <div className="sr-only">
        <table>
          <caption>{t('progress.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('progress.colDay')}</th>
              <th scope="col">{t('progress.colMinutes')}</th>
              <th scope="col">{t('progress.colStress')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row">{ddmm(d.date)}</th>
                <td>{d.movementMinutes}</td>
                <td>{d.stress ?? t('progress.noStress')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
