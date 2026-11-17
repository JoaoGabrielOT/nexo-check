import type { DailyLog } from '@nexo/shared';
import { db } from './db';
import { getSettings } from './repos/settings';
import { backupFileSchema, type BackupFile } from './schemas';

export class BackupError extends Error {
  readonly messageKey = 'errors.backup.invalid';
  constructor() {
    super('errors.backup.invalid');
    this.name = 'BackupError';
  }
}

export async function exportAll(): Promise<BackupFile> {
  return db.transaction('r', db.tables, async () => ({
    app: 'nexo-check' as const,
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    data: {
      habits: await db.habits.toArray(),
      habitEntries: await db.habitEntries.toArray(),
      dailyLogs: await db.dailyLogs.toArray(),
      questionnaireResponses: await db.questionnaireResponses.toArray(),
      checkins: await db.checkins.toArray(),
      settings: await getSettings(),
    },
  }));
}

export async function importAll(file: unknown): Promise<void> {
  const parsed = backupFileSchema.safeParse(file);
  if (!parsed.success) throw new BackupError();
  const { data } = parsed.data;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.habits.bulkPut(data.habits);
    await db.habitEntries.bulkPut(data.habitEntries);
    await db.dailyLogs.bulkPut(data.dailyLogs as DailyLog[]);
    await db.questionnaireResponses.bulkPut(data.questionnaireResponses);
    await db.checkins.bulkPut(data.checkins);
    await db.settings.put({ key: 'app', value: data.settings });
  });
}

export async function wipeLocal(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
