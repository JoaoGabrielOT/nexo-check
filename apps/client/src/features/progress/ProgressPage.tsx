import {
  CalendarCheck,
  ClipboardCheck,
  Footprints,
  MapPin,
  Medal,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, toLocalDateKey } from '@nexo/shared';
import type { AchievementId } from '@nexo/shared';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, Tile, cn } from '@nexo/ui';
import { useToday } from '../today/useToday';
import { Heatmap } from './Heatmap';
import { useAchievements } from './useAchievements';
import { countMovementDays, useProgressData } from './useProgressData';
import type { ProgressDay, ProgressRange } from './useProgressData';
import { WeekMonthChart } from './WeekMonthChart';

const fmtDate = (iso: string) => {
  const key = toLocalDateKey(new Date(iso));
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
};

/** "Novembro de 2026" a partir de `YYYY-MM-DD`. */
const monthTitle = (key: string) => {
  const label = new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const BADGE_ICON: Record<AchievementId, LucideIcon> = {
  first_full_day: Sun,
  streak_3: Footprints,
  streak_7: CalendarCheck,
  first_perfect_week: Medal,
  breathing_10: Wind,
  first_checkin: MapPin,
  initial_questionnaire: ClipboardCheck,
};

const panel =
  'flex flex-col gap-3 rounded-[28px] border border-text/10 bg-surface p-5 sm:p-6 dark:border-tile-edge dark:bg-tile-plain';
const panelTitle = 'text-lg leading-tight font-extrabold tracking-[-0.02em]';

/** Uma pílula por dia do mês: cheia com movimento, vazada sem, apagada no futuro. Só visual. */
function MonthStrip({ days, today }: { days: ProgressDay[]; today: string }) {
  const total = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const moved = new Set(days.filter((d) => d.movementMinutes > 0).map((d) => d.date));
  const prefix = today.slice(0, 8);
  const todayNumber = Number(today.slice(8, 10));
  return (
    <div
      aria-hidden="true"
      className="grid h-9 gap-[3px] sm:h-11 sm:gap-1"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const date = `${prefix}${String(n).padStart(2, '0')}`;
        return (
          <span
            key={n}
            className={cn(
              'rounded-full',
              n > todayNumber
                ? 'bg-hero-ink/10'
                : moved.has(date)
                  ? 'bg-hero-action'
                  : 'border-[1.5px] border-hero-ink/35',
            )}
          />
        );
      })}
    </div>
  );
}

export function ProgressPage() {
  const { t } = useTranslation();
  const today = useToday();
  const [range, setRange] = useState<ProgressRange>('week');
  const { days, streak } = useProgressData(range);
  const { days: monthDays } = useProgressData('month');
  const unlocked = useAchievements();
  const movementDays = countMovementDays(monthDays);

  const unlockedAt = new Map(unlocked?.map((a) => [a.id, a.at]));
  const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
  const ordered = [
    ...ids.filter((id) => unlockedAt.has(id)),
    ...ids.filter((id) => !unlockedAt.has(id)),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 sm:gap-5">
      <PageHeader eyebrow={monthTitle(today)} title={t('pages.progress')} className="mb-1" />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-12">
        <section
          aria-label={t('progress.movementMonth')}
          className="relative isolate flex flex-col gap-5 overflow-hidden rounded-hero bg-hero p-6 text-hero-ink sm:p-8 xl:col-span-7"
        >
          <p aria-hidden="true" className="eyebrow">
            {t('progress.movementMonth')}
          </p>
          <p className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <span className="text-[5.5rem] leading-[0.8] font-extrabold tracking-[-0.05em] tabular-nums sm:text-[7rem]">
              {movementDays}
            </span>
            <span className="max-w-[13ch] pb-1 text-lg leading-tight font-bold text-balance">
              {t('progress.movementDays', { count: movementDays })}
            </span>
          </p>
          <MonthStrip days={monthDays} today={today} />
          <p className="max-w-prose text-sm font-semibold text-balance">
            {t('progress.movementMonthHint')}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:col-span-5 xl:grid-cols-1">
          <Tile tone="sleep" label={t('progress.streakCurrent')}>
            <p className="text-3xl leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-4xl">
              {t('progress.days', { count: streak.current })}
            </p>
            <p className="text-sm font-medium">{t('progress.streakHint')}</p>
          </Tile>
          <Tile tone="breathing" label={t('progress.streakBest')}>
            <p className="text-3xl leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-4xl">
              {t('progress.days', { count: streak.best })}
            </p>
            <p className="text-sm font-medium">{t('progress.streakBestHint')}</p>
          </Tile>
        </div>

        <section aria-labelledby="chart-title" className={cn(panel, 'xl:col-span-7')}>
          <h2 id="chart-title" className={panelTitle}>
            {t('progress.chartTitle')}
          </h2>
          <Tabs value={range} onValueChange={(v) => setRange(v as ProgressRange)}>
            <TabsList aria-label={t('progress.range')}>
              <TabsTrigger value="week">{t('progress.week')}</TabsTrigger>
              <TabsTrigger value="month">{t('progress.month')}</TabsTrigger>
            </TabsList>
            <TabsContent value={range}>
              <WeekMonthChart days={days} range={range} today={today} />
            </TabsContent>
          </Tabs>
        </section>

        <section aria-labelledby="heatmap-title" className={cn(panel, 'xl:col-span-5')}>
          <h2 id="heatmap-title" className={panelTitle}>
            {t('progress.heatmapTitle')}
          </h2>
          <Heatmap days={monthDays} today={today} />
        </section>
      </div>

      <section className="mt-2 flex flex-col gap-4" aria-labelledby="achievements-title">
        <h2
          id="achievements-title"
          className="text-2xl leading-tight font-extrabold tracking-[-0.03em]"
        >
          {t('progress.achievementsTitle')}
        </h2>
        <ul
          aria-labelledby="achievements-title"
          className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {ordered.map((id) => {
            const at = unlockedAt.get(id);
            const Icon = BADGE_ICON[id];
            return (
              <li key={id} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-14 shrink-0 place-items-center rounded-full',
                    at
                      ? 'bg-navy text-[#f7f5f2] dark:bg-peach dark:text-navy'
                      : 'border-2 border-dashed border-muted/60 text-muted',
                  )}
                >
                  <Icon className="size-6" strokeWidth={2} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                  <h3 className={cn('leading-tight font-extrabold', !at && 'text-muted')}>
                    {t(ACHIEVEMENTS[id].titleKey)}
                  </h3>
                  <p className="text-sm text-muted">{t(ACHIEVEMENTS[id].descriptionKey)}</p>
                  <p className={cn('text-xs font-bold', at ? 'text-text' : 'text-muted')}>
                    {at
                      ? t('progress.achievementUnlocked', { date: fmtDate(at) })
                      : t('progress.achievementLocked')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="max-w-prose text-sm text-muted">{t('progress.achievementsNote')}</p>
      </section>
    </div>
  );
}
