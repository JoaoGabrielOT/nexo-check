import type { EntityPayload, SyncEntityName } from './types';

/** Remove campos que nunca saem do dispositivo. Não altera a entrada. */
export function stripPrivateFields<T extends SyncEntityName>(
  entity: T,
  payload: EntityPayload<T>,
): EntityPayload<T> {
  const copy = { ...payload };
  if (entity === 'dailyLog') (copy as EntityPayload<'dailyLog'>).note = null;
  return copy;
}
