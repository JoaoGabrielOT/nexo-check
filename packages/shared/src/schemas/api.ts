import { z } from 'zod';
import { normalizeCode } from '../codes';
import { syncChangeSchema } from './entities';
import { answers } from './questionnaire';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = z.iso.datetime();
const workshop = z.union([z.literal(1), z.literal(2)]);
const sessionCode = z
  .string()
  .transform(normalizeCode)
  .pipe(z.string().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/));

export const registerRequest = z.object({
  code: z.string().min(1),
  key: z.string().min(1),
  consentVersion: z.string().min(1),
});

export const syncPushRequest = z.object({ changes: z.array(syncChangeSchema).max(500) });
export const syncPushResponse = z.object({ applied: z.number().int(), cursor: z.string() });
export const syncPullResponse = z.object({
  changes: z.array(syncChangeSchema),
  cursor: z.string(),
});

export const questionnaireSubmit = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  version: z.union([z.number(), z.string()]),
  answers,
  submittedAt: iso,
});
export const questionnaireSubmitResponse = z.object({ score: z.number().nullable() });

export const checkinRequest = z.object({ sessionCode, clientId: z.string().min(1) });
export const checkinResponse = z.object({
  status: z.literal('confirmed'),
  workshop,
  date: dateKey,
});

export const adminLoginRequest = z.object({ password: z.string().min(1) });
export const adminLoginResponse = z.object({ token: z.string() });

export const sessionCreate = z.object({ workshop, date: dateKey, location: z.string() });
export const sessionView = z.object({
  id: z.string(),
  workshop,
  date: dateKey,
  location: z.string(),
  code: z.string(),
  checkinUrl: z.string(),
  expiresAt: iso,
  checkins: z.number().int(),
  manualCount: z.number().int(),
});
export const manualAttendanceUpdate = z.object({ manualCount: z.number().int().min(0) });

export const apiError = z.object({ error: z.string(), message: z.string() });

export type RegisterRequest = z.infer<typeof registerRequest>;
export type SyncPushRequest = z.infer<typeof syncPushRequest>;
export type SyncPushResponse = z.infer<typeof syncPushResponse>;
export type SyncPullResponse = z.infer<typeof syncPullResponse>;
export type QuestionnaireSubmit = z.infer<typeof questionnaireSubmit>;
export type QuestionnaireSubmitResponse = z.infer<typeof questionnaireSubmitResponse>;
export type CheckinRequest = z.infer<typeof checkinRequest>;
export type CheckinResponse = z.infer<typeof checkinResponse>;
export type AdminLoginRequest = z.infer<typeof adminLoginRequest>;
export type AdminLoginResponse = z.infer<typeof adminLoginResponse>;
export type SessionCreate = z.infer<typeof sessionCreate>;
export type SessionView = z.infer<typeof sessionView>;
export type ManualAttendanceUpdate = z.infer<typeof manualAttendanceUpdate>;
export type ApiError = z.infer<typeof apiError>;
