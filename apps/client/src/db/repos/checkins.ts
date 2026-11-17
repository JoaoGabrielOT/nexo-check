import { db } from '../db';
import { now } from '../clock';
import { newId } from '../ids';
import type { LocalCheckin } from '../schemas';

export async function addCheckin(sessionCode: string): Promise<LocalCheckin> {
  const checkin: LocalCheckin = {
    id: newId(),
    sessionCode,
    createdAt: now().toISOString(),
    status: 'pending',
    reason: null,
    workshop: null,
    date: null,
    syncedAt: null,
  };
  await db.checkins.put(checkin);
  return checkin;
}

export async function updateCheckinStatus(id: string, patch: Partial<LocalCheckin>): Promise<void> {
  await db.checkins.update(id, patch);
}
