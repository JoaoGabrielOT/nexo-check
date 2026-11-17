import { makeEntry } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { db } from '../db';
import { now } from '../clock';
import { enqueueIfConsented } from './outbox';

export async function setEntry(
  habit: Habit,
  date: string,
  value: number,
  blocks: number[] = [],
): Promise<void> {
  await db.transaction('rw', [db.habitEntries, db.outbox, db.settings], async () => {
    const at = now();
    const existing = await db.habitEntries.get(`${habit.id}:${date}`);
    // Mudar a meta depois nunca reescreve o dia: o snapshot do primeiro registro permanece.
    const row: HabitEntry =
      existing && existing.deletedAt === null
        ? { ...existing, value, blocks: [...blocks], updatedAt: at.toISOString() }
        : makeEntry(habit, date, value, blocks, at);
    await db.habitEntries.put(row);
    await enqueueIfConsented('habitEntry', row);
  });
}

export async function getEntriesBetween(from: string, to: string): Promise<HabitEntry[]> {
  const rows = await db.habitEntries.where('date').between(from, to, true, true).toArray();
  return rows.filter((e) => e.deletedAt === null);
}

export function getEntriesForDate(date: string): Promise<HabitEntry[]> {
  return getEntriesBetween(date, date);
}
