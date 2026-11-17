import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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

export function WeekMonthChart({ days, range }: { days: ProgressDay[]; range: ProgressRange }) {
  const { t } = useTranslation();
  const [animate] = useState(() => !prefersReducedMotion());
  const tick = range === 'week' ? ddmm : dd;

  return (
    <>
      <div
        className="mb-1 flex justify-between gap-2 text-xs font-semibold opacity-80"
        aria-hidden="true"
      >
        <span>{t('progress.axisMinutes')}</span>
        <span className="text-right">{t('progress.axisStress')}</span>
      </div>
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" tickFormatter={tick} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} width={36} />
            <YAxis
              yAxisId="stress"
              orientation="right"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              width={28}
            />
            <Bar
              dataKey="movementMinutes"
              fill="var(--color-bl)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={animate}
            />
            <Line
              yAxisId="stress"
              dataKey="stress"
              stroke="var(--color-rd)"
              strokeWidth={3}
              dot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={animate}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold" aria-hidden="true">
        <li className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="1" y="3" width="14" height="12" rx="2" fill="var(--color-bl)" />
          </svg>
          {t('progress.axisMinutes')}
        </li>
        <li className="flex items-center gap-2">
          <svg width="24" height="16" viewBox="0 0 24 16">
            <line x1="0" y1="8" x2="24" y2="8" stroke="var(--color-rd)" strokeWidth="3" />
            <circle cx="12" cy="8" r="4.5" fill="var(--color-rd)" />
          </svg>
          {t('progress.axisStress')}
        </li>
      </ul>
      <table className="sr-only">
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
    </>
  );
}
