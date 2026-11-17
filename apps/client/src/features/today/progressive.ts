import { isEntryMet, lastNDateKeys, nextProgressiveTarget } from '@nexo/shared';
import { db } from '../../db/db';
import { getEntriesBetween, getHabits, getSettings, saveHabit, updateSettings } from '../../db';

/** Modo progressivo: no máximo uma vez por dia local; só mexe na meta do movimento. */
export async function applyProgressive(today: string): Promise<void> {
  await db.transaction('rw', [db.habits, db.habitEntries, db.outbox, db.settings], async () => {
    if ((await getSettings()).progressiveCheckedOn === today) return;
    const movement = (await getHabits()).find((h) => h.key === 'movement');
    if (!movement?.progressive?.enabled) return;
    const days = lastNDateKeys(today, 8).slice(0, 7);
    const entries = await getEntriesBetween(days[0] ?? today, days[6] ?? today);
    const byDate = new Map(
      entries.filter((e) => e.habitId === movement.id).map((e) => [e.date, e]),
    );
    const met = days.map((d) => isEntryMet(movement.type, byDate.get(d)));
    const target = nextProgressiveTarget(movement.target, met, movement.progressive.ceiling);
    if (target !== movement.target) await saveHabit({ ...movement, target });
    await updateSettings({ progressiveCheckedOn: today });
  });
}
