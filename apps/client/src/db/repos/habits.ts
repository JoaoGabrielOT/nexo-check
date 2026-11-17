import { createDefaultHabits } from '@nexo/shared';
import type { Habit } from '@nexo/shared';
import { db } from '../db';
import { now } from '../clock';
import { newId } from '../ids';
import { enqueueIfConsented } from './outbox';

export async function saveHabit(h: Habit): Promise<void> {
  await db.transaction('rw', [db.habits, db.outbox, db.settings], async () => {
    const row: Habit = { ...h, updatedAt: now().toISOString() };
    await db.habits.put(row);
    await enqueueIfConsented('habit', row);
  });
}

/** Tombstone: a linha continua, com `deletedAt`, para o delete sincronizar. */
export async function deleteHabit(id: string): Promise<void> {
  await db.transaction('rw', [db.habits, db.outbox, db.settings], async () => {
    const current = await db.habits.get(id);
    if (!current || current.deletedAt !== null) return;
    const at = now().toISOString();
    const row: Habit = { ...current, deletedAt: at, updatedAt: at };
    await db.habits.put(row);
    await enqueueIfConsented('habit', row);
  });
}

export async function getHabits(): Promise<Habit[]> {
  const rows = await db.habits.orderBy('order').toArray();
  return rows.filter((h) => h.deletedAt === null);
}

export async function ensureDefaultHabits(at: Date): Promise<void> {
  await db.transaction('rw', [db.habits, db.outbox, db.settings], async () => {
    if ((await db.habits.count()) > 0) return;
    for (const habit of createDefaultHabits(at, newId)) {
      await db.habits.put(habit);
      await enqueueIfConsented('habit', habit);
    }
  });
}
