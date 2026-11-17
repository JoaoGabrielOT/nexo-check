import type { DailyLog } from '@nexo/shared';
import { db } from '../db';
import { now } from '../clock';
import { enqueueIfConsented } from './outbox';

export async function saveDailyLog(log: Omit<DailyLog, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await db.transaction('rw', [db.dailyLogs, db.outbox, db.settings], async () => {
    const row: DailyLog = { ...log, updatedAt: now().toISOString(), deletedAt: null };
    await db.dailyLogs.put(row);
    await enqueueIfConsented('dailyLog', row);
  });
}

export async function getDailyLog(date: string): Promise<DailyLog | undefined> {
  const row = await db.dailyLogs.where('date').equals(date).first();
  return row && row.deletedAt === null ? row : undefined;
}

export async function getDailyLogsBetween(from: string, to: string): Promise<DailyLog[]> {
  const rows = await db.dailyLogs.where('date').between(from, to, true, true).toArray();
  return rows.filter((l) => l.deletedAt === null);
}
