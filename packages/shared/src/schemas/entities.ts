import { z } from 'zod';
import { dateKey, iso } from './primitives';

const scale = z.number().int().min(1).max(5);

const syncMeta = {
  id: z.string().min(1),
  updatedAt: iso,
  deletedAt: iso.nullable(),
};

export const habitSchema = z.object({
  ...syncMeta,
  key: z
    .enum(['movement', 'active_breaks', 'mobility', 'breathing', 'sleep', 'hydration'])
    .nullable(),
  name: z.string().max(80),
  description: z.string().max(200),
  type: z.enum(['boolean', 'counter', 'minutes', 'range_hours']),
  target: z.number().nonnegative(),
  targetMax: z.number().nonnegative().nullable(),
  active: z.boolean(),
  order: z.number().int(),
  progressive: z.object({ enabled: z.boolean(), ceiling: z.number().nonnegative() }).nullable(),
});

export const habitEntrySchema = z
  .object({
    ...syncMeta,
    habitId: z.string().min(1),
    date: dateKey,
    value: z.number().nonnegative(),
    blocks: z.array(z.number().nonnegative()).max(200),
    targetSnapshot: z.number().nonnegative(),
    targetMaxSnapshot: z.number().nonnegative().nullable(),
  })
  .refine((e) => e.targetMaxSnapshot === null || e.targetMaxSnapshot >= e.targetSnapshot, {
    message: 'targetMaxSnapshot must be >= targetSnapshot',
    path: ['targetMaxSnapshot'],
  });

export const dailyLogSchema = z.object({
  ...syncMeta,
  date: dateKey,
  stress: scale,
  mood: scale,
  energy: scale,
  sleepQuality: scale,
  note: z.string().nullable(),
});

/** Payload de sincronização: texto livre nunca sai do dispositivo. */
export const dailyLogSyncPayloadSchema = dailyLogSchema.extend({ note: z.null() });

export const syncEntityName = z.enum(['habit', 'habitEntry', 'dailyLog']);

const changeBase = {
  entityId: z.string().min(1),
  updatedAt: iso,
  deletedAt: iso.nullable(),
};

export const syncChangeSchema = z.discriminatedUnion('entity', [
  z.object({ ...changeBase, entity: z.literal('habit'), payload: habitSchema }),
  z.object({ ...changeBase, entity: z.literal('habitEntry'), payload: habitEntrySchema }),
  z.object({ ...changeBase, entity: z.literal('dailyLog'), payload: dailyLogSyncPayloadSchema }),
]);

export type SyncChange = z.infer<typeof syncChangeSchema>;
