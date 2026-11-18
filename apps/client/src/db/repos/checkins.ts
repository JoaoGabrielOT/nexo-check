import { db } from '../db';
import { now } from '../clock';
import { newId } from '../ids';
import { notifyLocalWrite } from '../localWrites';
import type { LocalCheckin } from '../schemas';

/** O código já foi registrado neste aparelho. */
export class DuplicateCheckinError extends Error {
  readonly sessionCode: string;
  constructor(sessionCode: string) {
    super(`Check-in duplicado: ${sessionCode}`);
    this.sessionCode = sessionCode;
    this.name = 'DuplicateCheckinError';
  }
}

/** Grava um check-in pendente; o mesmo código nunca entra duas vezes (checado dentro da transação). */
export async function addCheckin(sessionCode: string): Promise<LocalCheckin> {
  const checkin = await db.transaction('rw', db.checkins, async () => {
    const existing = await db.checkins.filter((c) => c.sessionCode === sessionCode).first();
    if (existing) throw new DuplicateCheckinError(sessionCode);
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
  });
  notifyLocalWrite();
  return checkin;
}

export async function updateCheckinStatus(id: string, patch: Partial<LocalCheckin>): Promise<void> {
  await db.checkins.update(id, patch);
}
