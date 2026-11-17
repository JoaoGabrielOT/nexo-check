import { db } from '../db';
import type { AppSettings, ReminderSettings } from '../schemas';

export type { AppSettings, ReminderSettings } from '../schemas';

export const DEFAULT_REMINDERS: ReminderSettings = {
  movement: { enabled: false, time: '08:00' },
  activeBreak: { enabled: false, everyMinutes: 60, from: '08:00', to: '18:00' },
  water: { enabled: false, everyMinutes: 90, from: '08:00', to: '20:00' },
  bedtime: { enabled: false, time: '22:30' },
};

export function defaultSettings(): AppSettings {
  return {
    onboardingDone: false,
    consent: null,
    participant: null,
    theme: 'system',
    reminders: structuredClone(DEFAULT_REMINDERS),
    syncCursor: null,
    lastSyncAt: null,
    unlockedAchievements: [],
  };
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  return { ...defaultSettings(), ...row?.value };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    await db.settings.put({ key: 'app', value: { ...current, ...patch } });
  });
}
