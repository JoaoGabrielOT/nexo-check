import { z } from 'zod';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = z.iso.datetime();
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
  name: z.string(),
  description: z.string(),
  type: z.enum(['boolean', 'counter', 'minutes', 'range_hours']),
  target: z.number(),
  targetMax: z.number().nullable(),
  active: z.boolean(),
  order: z.number().int(),
  progressive: z.object({ enabled: z.boolean(), ceiling: z.number() }).nullable(),
});

export const habitEntrySchema = z
  .object({
    ...syncMeta,
    habitId: z.string().min(1),
    date: dateKey,
    value: z.number(),
    blocks: z.array(z.number()),
    targetSnapshot: z.number(),
    targetMaxSnapshot: z.number().nullable(),
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

export const syncEntityName = z.enum(['habit', 'habitEntry', 'dailyLog']);

const changeBase = {
  entityId: z.string().min(1),
  updatedAt: iso,
  deletedAt: iso.nullable(),
};

export const syncChangeSchema = z.discriminatedUnion('entity', [
  z.object({ ...changeBase, entity: z.literal('habit'), payload: habitSchema }),
  z.object({ ...changeBase, entity: z.literal('habitEntry'), payload: habitEntrySchema }),
  z.object({ ...changeBase, entity: z.literal('dailyLog'), payload: dailyLogSchema }),
]);

export type SyncChange = z.infer<typeof syncChangeSchema>;
