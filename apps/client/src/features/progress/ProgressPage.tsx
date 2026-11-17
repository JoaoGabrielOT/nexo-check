import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, toLocalDateKey } from '@nexo/shared';
import type { AchievementId } from '@nexo/shared';
import { Card, Panel, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@nexo/ui';
import { useToday } from '../today/useToday';
import { Heatmap } from './Heatmap';
import { useAchievements } from './useAchievements';
import { useProgressData } from './useProgressData';
import type { ProgressRange } from './useProgressData';
import { WeekMonthChart } from './WeekMonthChart';

const fmtDate = (iso: string) => {
  const key = toLocalDateKey(new Date(iso));
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
};

export function ProgressPage() {
  const { t } = useTranslation();
  const today = useToday();
  const [range, setRange] = useState<ProgressRange>('week');
  const { days, streak } = useProgressData(range);
  const { days: monthDays } = useProgressData('month');
  const unlocked = useAchievements();

  const unlockedAt = new Map(unlocked?.map((a) => [a.id, a.at]));
  const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
  const ordered = [
    ...ids.filter((id) => unlockedAt.has(id)),
    ...ids.filter((id) => !unlockedAt.has(id)),
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.progress')}</h1>

      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <p className="text-sm font-semibold">{t('progress.streakCurrent')}</p>
          <p className="text-2xl font-extrabold">{t('progress.days', { count: streak.current })}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold">{t('progress.streakBest')}</p>
          <p className="text-2xl font-extrabold">{t('progress.days', { count: streak.best })}</p>
        </Panel>
      </div>
      <p className="text-sm opacity-80">{t('progress.streakHint')}</p>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">{t('progress.chartTitle')}</h2>
        <Tabs value={range} onValueChange={(v) => setRange(v as ProgressRange)}>
          <TabsList aria-label={t('progress.range')}>
            <TabsTrigger value="week">{t('progress.week')}</TabsTrigger>
            <TabsTrigger value="month">{t('progress.month')}</TabsTrigger>
          </TabsList>
          <TabsContent value={range}>
            <WeekMonthChart days={days} range={range} />
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">{t('progress.heatmapTitle')}</h2>
        <Heatmap days={monthDays} today={today} />
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="achievements-title">
        <h2 id="achievements-title" className="text-lg font-extrabold">
          {t('progress.achievementsTitle')}
        </h2>
        <ul className="flex flex-col gap-3">
          {ordered.map((id) => {
            const at = unlockedAt.get(id);
            return (
              <li key={id}>
                <Card
                  className={cn(
                    'border-2 border-transparent',
                    at ? 'border-navy dark:border-lav2' : 'opacity-60',
                  )}
                >
                  <h3 className="font-extrabold">{t(ACHIEVEMENTS[id].titleKey)}</h3>
                  <p className="text-sm">{t(ACHIEVEMENTS[id].descriptionKey)}</p>
                  <p className="text-sm font-semibold">
                    {at
                      ? t('progress.achievementUnlocked', { date: fmtDate(at) })
                      : t('progress.achievementLocked')}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
        <p className="text-sm opacity-80">{t('progress.achievementsNote')}</p>
      </section>
    </div>
  );
}
