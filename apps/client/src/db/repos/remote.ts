import type { DailyLog, SyncChange } from '@nexo/shared';
import { db } from '../db';

/** LWW local: aplica só se o remoto for mais novo; nunca reenfileira. */
export async function applyRemoteChanges(changes: SyncChange[]): Promise<void> {
  await db.transaction('rw', [db.habits, db.habitEntries, db.dailyLogs], async () => {
    for (const c of changes) {
      if (c.entity === 'habit') {
        const local = await db.habits.get(c.entityId);
        if (!local || c.payload.updatedAt > local.updatedAt) await db.habits.put(c.payload);
      } else if (c.entity === 'habitEntry') {
        const local = await db.habitEntries.get(c.entityId);
        if (!local || c.payload.updatedAt > local.updatedAt) await db.habitEntries.put(c.payload);
      } else {
        const local = await db.dailyLogs.get(c.entityId);
        // O servidor nunca tem o texto livre: preserva a nota local.
        if (!local || c.payload.updatedAt > local.updatedAt) {
          await db.dailyLogs.put({ ...c.payload, note: local?.note ?? null } as DailyLog);
        }
      }
    }
  });
}
