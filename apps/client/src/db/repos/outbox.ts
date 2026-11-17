import { CONSENT_VERSION, stripPrivateFields } from '@nexo/shared';
import type { EntityPayload, SyncChange, SyncEntityName } from '@nexo/shared';
import { db } from '../db';

/** Deve rodar dentro de uma transação que inclua `outbox` e `settings`. */
export async function enqueueIfConsented<T extends SyncEntityName>(
  entity: T,
  payload: EntityPayload<T>,
): Promise<void> {
  const consent = (await db.settings.get('app'))?.value.consent;
  if (!consent?.granted || consent.version < CONSENT_VERSION) return;
  // Texto livre nunca entra no outbox: um único note faria o servidor recusar o lote.
  const safe = stripPrivateFields(entity, payload);
  const change = {
    entity,
    entityId: safe.id,
    payload: safe,
    updatedAt: safe.updatedAt,
    deletedAt: safe.deletedAt,
  } as SyncChange;
  await db.outbox.add({ entity, entityId: safe.id, change });
}

export async function peekOutbox(limit: number): Promise<{ seq: number; change: SyncChange }[]> {
  const rows = await db.outbox.orderBy('seq').limit(limit).toArray();
  return rows.map((r) => ({ seq: r.seq as number, change: r.change }));
}

export async function ackOutbox(seqs: number[]): Promise<void> {
  await db.outbox.bulkDelete(seqs);
}

export async function clearOutbox(): Promise<void> {
  await db.outbox.clear();
}

export function outboxCount(): Promise<number> {
  return db.outbox.count();
}
