import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, dayProgress, evaluateAchievements, lastNDateKeys } from '@nexo/shared';
import type { AchievementId } from '@nexo/shared';
import { toast } from '@nexo/ui';
import { db } from '../../db/db';
import { now } from '../../db/clock';
import {
  getEntriesBetween,
  getHabits,
  getQuestionnaireResponses,
  getSettings,
  updateSettings,
} from '../../db';
import { useToday } from '../today/useToday';
import { HISTORY_DAYS } from './useProgressData';

/** Avalia as conquistas e grava só as novas, uma única vez; devolve as recém-desbloqueadas. */
export async function unlockAchievements(today: string): Promise<AchievementId[]> {
  const history = lastNDateKeys(today, HISTORY_DAYS);
  const [habits, recent, all, checkins, initial] = await Promise.all([
    getHabits(),
    getEntriesBetween(history[0] ?? today, today),
    getEntriesBetween('0000-01-01', '9999-12-31'),
    db.checkins.where('status').equals('confirmed').count(),
    getQuestionnaireResponses('inicial'),
  ]);
  const breathingId = habits.find((h) => h.key === 'breathing')?.id;
  const earned = evaluateAchievements({
    ratiosByDate: Object.fromEntries(history.map((d) => [d, dayProgress(habits, recent, d).ratio])),
    today,
    breathingSessions: all.filter((e) => e.habitId === breathingId && e.value >= 1).length,
    confirmedCheckins: checkins,
    initialQuestionnaireDone: initial.length > 0,
  });
  if (earned.length === 0) return [];

  // Relê as configurações dentro da transação para não duplicar com execuções concorrentes.
  return db.transaction('rw', db.settings, async () => {
    const current = (await getSettings()).unlockedAchievements;
    const have = new Set(current.map((a) => a.id));
    const fresh = earned.filter((id) => !have.has(id));
    if (fresh.length > 0) {
      const at = now().toISOString();
      await updateSettings({
        unlockedAchievements: [...current, ...fresh.map((id) => ({ id, at }))],
      });
    }
    return fresh;
  });
}

/** Avalia ao abrir a tela e devolve as conquistas já desbloqueadas (`null` enquanto carrega). */
export function useAchievements() {
  const { t } = useTranslation();
  const today = useToday();
  const settings = useLiveQuery(getSettings, []);

  useEffect(() => {
    void unlockAchievements(today)
      .then((fresh) => {
        for (const id of fresh) {
          toast(t('progress.achievementToast', { title: t(ACHIEVEMENTS[id].titleKey) }));
        }
      })
      .catch(() => toast(t('errors.generic')));
  }, [today, t]);

  return settings?.unlockedAchievements ?? null;
}
