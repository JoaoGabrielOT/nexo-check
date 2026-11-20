import { CONSENT_VERSION, stripPrivateFields } from '@nexo/shared';
import type { EntityPayload, SyncChange, SyncEntityName } from '@nexo/shared';
import { db } from '../db';
import { notifyLocalWrite } from '../localWrites';

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
  notifyLocalWrite();
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

/**
 * Reenvio do histórico (reconsentimento ou novo cadastro no servidor): refaz o outbox com todas as
 * linhas sincronizáveis, zera o cursor e marca respostas e check-ins como não enviados. O servidor é
 * idempotente por participante, então reenviar é inofensivo.
 */
export async function backfillHistory(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.habits,
      db.habitEntries,
      db.dailyLogs,
      db.outbox,
      db.settings,
      db.questionnaireResponses,
      db.checkins,
    ],
    async () => {
      // Reconfere o consentimento dentro da transação: uma revogação que commitou no meio da
      // execução não pode ser desfeita (flag limpo) nem gerar fila sem consentimento.
      const consent = (await db.settings.get('app'))?.value.consent;
      if (!consent?.granted || consent.version < CONSENT_VERSION) return;
      await db.outbox.clear();
      for (const h of await db.habits.toArray()) await enqueueIfConsented('habit', h);
      for (const e of await db.habitEntries.toArray()) await enqueueIfConsented('habitEntry', e);
      for (const l of await db.dailyLogs.toArray()) await enqueueIfConsented('dailyLog', l);
      await db.questionnaireResponses.toCollection().modify((r) => {
        r.syncedAt = null;
        delete r.syncConflict;
      });
      await db.checkins.toCollection().modify((c) => {
        c.status = 'pending';
        c.reason = null;
        c.syncedAt = null;
      });
      const row = await db.settings.get('app');
      if (row) {
        await db.settings.put({
          key: 'app',
          value: { ...row.value, syncCursor: null, backfillPending: false },
        });
      }
    },
  );
}
