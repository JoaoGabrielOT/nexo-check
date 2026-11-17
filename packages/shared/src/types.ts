export type HabitType = 'boolean' | 'counter' | 'minutes' | 'range_hours';

export type DefaultHabitKey =
  'movement' | 'active_breaks' | 'mobility' | 'breathing' | 'sleep' | 'hydration';

export type Scale = 1 | 2 | 3 | 4 | 5;

export interface SyncMeta {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Habit extends SyncMeta {
  key: DefaultHabitKey | null;
  name: string;
  description: string;
  type: HabitType;
  target: number;
  targetMax: number | null;
  active: boolean;
  order: number;
  progressive: { enabled: boolean; ceiling: number } | null;
}

/** `id` = `${habitId}:${date}` */
export interface HabitEntry extends SyncMeta {
  habitId: string;
  date: string;
  value: number;
  blocks: number[];
  targetSnapshot: number;
  targetMaxSnapshot: number | null;
}

/** `id` = `date` */
export interface DailyLog extends SyncMeta {
  date: string;
  stress: Scale;
  mood: Scale;
  energy: Scale;
  sleepQuality: Scale;
  note: string | null;
}
