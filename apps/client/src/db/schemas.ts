import { z } from 'zod';
import {
  answers,
  dailyLogSchema,
  habitEntrySchema,
  habitSchema,
  questionnaireKind,
} from '@nexo/shared';
import type { AchievementId } from '@nexo/shared';

const iso = z.iso.datetime();
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const achievementId = z.enum([
  'first_full_day',
  'streak_3',
  'streak_7',
  'first_perfect_week',
  'breathing_10',
  'first_checkin',
  'initial_questionnaire',
] satisfies AchievementId[]);

const interval = z.object({
  enabled: z.boolean(),
  everyMinutes: z.number().int().positive(),
  from: hhmm,
  to: hhmm,
});

export const reminderSettingsSchema = z.object({
  movement: z.object({ enabled: z.boolean(), time: hhmm }),
  activeBreak: interval,
  water: interval,
  bedtime: z.object({ enabled: z.boolean(), time: hhmm }),
});

export const appSettingsSchema = z.object({
  onboardingDone: z.boolean(),
  consent: z.object({ granted: z.boolean(), version: z.number().int(), at: iso }).nullable(),
  participant: z.object({ code: z.string(), key: z.string(), registered: z.boolean() }).nullable(),
  theme: z.enum(['light', 'dark', 'system']),
  reminders: reminderSettingsSchema,
  syncCursor: z.string().nullable(),
  progressiveCheckedOn: z.string().optional(),
  lastSyncAt: iso.nullable(),
  unlockedAchievements: z.array(z.object({ id: achievementId, at: iso })),
});

export const localQuestionnaireResponseSchema = z.object({
  id: z.string().min(1),
  kind: questionnaireKind,
  version: z.number().int().positive(),
  answers,
  score: z.number().nullable(),
  submittedAt: iso,
  syncedAt: iso.nullable(),
});

export const localCheckinSchema = z.object({
  id: z.string().min(1),
  sessionCode: z.string(),
  createdAt: iso,
  status: z.enum(['pending', 'confirmed', 'rejected']),
  reason: z.enum(['invalid_code', 'expired']).nullable(),
  workshop: z.union([z.literal(1), z.literal(2)]).nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  syncedAt: iso.nullable(),
});

export const backupFileSchema = z.object({
  app: z.literal('nexo-check'),
  schemaVersion: z.literal(1),
  exportedAt: iso,
  data: z.object({
    habits: z.array(habitSchema),
    habitEntries: z.array(habitEntrySchema),
    dailyLogs: z.array(dailyLogSchema),
    questionnaireResponses: z.array(localQuestionnaireResponseSchema),
    checkins: z.array(localCheckinSchema),
    settings: appSettingsSchema,
  }),
});

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type LocalQuestionnaireResponse = z.infer<typeof localQuestionnaireResponseSchema>;
export type LocalCheckin = z.infer<typeof localCheckinSchema>;
export type BackupFile = z.infer<typeof backupFileSchema>;
