import Dexie, { type EntityTable } from 'dexie';
import type { DailyLog, Habit, HabitEntry, SyncChange } from '@nexo/shared';
import type { AppSettings, LocalCheckin, LocalQuestionnaireResponse } from './schemas';

export interface OutboxRow {
  seq?: number;
  entity: SyncChange['entity'];
  entityId: string;
  change: SyncChange;
}

export interface SettingsRow {
  key: 'app';
  value: AppSettings;
}

class NexoDb extends Dexie {
  habits!: EntityTable<Habit, 'id'>;
  habitEntries!: EntityTable<HabitEntry, 'id'>;
  dailyLogs!: EntityTable<DailyLog, 'id'>;
  questionnaireResponses!: EntityTable<LocalQuestionnaireResponse, 'id'>;
  checkins!: EntityTable<LocalCheckin, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  outbox!: EntityTable<OutboxRow, 'seq'>;

  constructor() {
    super('nexo-check');
    this.version(1).stores({
      habits: 'id, order',
      habitEntries: 'id, date, habitId',
      dailyLogs: 'id, date',
      questionnaireResponses: 'id, kind',
      checkins: 'id, status',
      settings: 'key',
      outbox: '++seq, entity, entityId',
    });
  }
}

export const db = new NexoDb();

/** Só para testes: apaga o banco e o reabre vazio. */
export async function resetDbForTests(): Promise<void> {
  await db.delete();
  await db.open();
}
