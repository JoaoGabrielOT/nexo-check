import { dayProgress, toCsv } from '@nexo/shared';
import type { BackupFile } from '../../db/schemas';

export const CSV_COLUMNS = [
  'data',
  'estresse',
  'humor',
  'disposicao',
  'sono',
  'checklist_pct',
  'minutos_movimento',
];

/** Um dia por linha (dias com registro do dia ou hábito). Sem anotações: o texto livre fica no aparelho. */
export function buildRecordsCsv(data: BackupFile['data']): string {
  const logs = new Map(data.dailyLogs.filter((l) => l.deletedAt === null).map((l) => [l.date, l]));
  const entries = data.habitEntries.filter((e) => e.deletedAt === null);
  const movementId = data.habits.find((h) => h.key === 'movement')?.id;
  const dates = [...new Set([...logs.keys(), ...entries.map((e) => e.date)])].sort();
  const rows = dates.map((date) => {
    const log = logs.get(date);
    const movement = entries.find((e) => e.date === date && e.habitId === movementId);
    return {
      data: date,
      estresse: log?.stress ?? null,
      humor: log?.mood ?? null,
      disposicao: log?.energy ?? null,
      sono: log?.sleepQuality ?? null,
      checklist_pct: Math.round(dayProgress(data.habits, entries, date).ratio * 100),
      minutos_movimento: movement?.value ?? 0,
    };
  });
  return toCsv(rows, CSV_COLUMNS);
}
