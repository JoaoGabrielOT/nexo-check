import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { CONSENT_VERSION } from '@nexo/shared';
import { db, getSettings, outboxCount } from '../db';
import { getSyncSnapshot, subscribeSyncState, type SyncErrorCode } from './engine';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  /** Alterações, respostas e check-ins ainda não enviados. */
  pending: number;
  error: SyncErrorCode | null;
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

const getOnline = () => navigator.onLine;

export function useSyncStatus(): SyncStatus {
  const snap = useSyncExternalStore(subscribeSyncState, getSyncSnapshot);
  const online = useSyncExternalStore(subscribeOnline, getOnline);
  const data = useLiveQuery(async () => {
    const settings = await getSettings();
    const [outbox, questionnaires, checkins] = await Promise.all([
      outboxCount(),
      db.questionnaireResponses.filter((r) => r.syncedAt === null).count(),
      db.checkins.filter((c) => c.status === 'pending' && c.syncedAt === null).count(),
    ]);
    return { settings, pending: outbox + questionnaires + checkins };
  }, []);

  if (!data) return { state: 'disabled', lastSyncAt: null, pending: 0, error: null };
  const { settings, pending } = data;
  const enabled = settings.consent?.granted === true && settings.consent.version >= CONSENT_VERSION;
  const base = { lastSyncAt: settings.lastSyncAt, pending, error: snap.error };
  if (!enabled) return { ...base, state: 'disabled', pending: 0 };
  if (!online) return { ...base, state: 'offline' };
  if (snap.phase === 'syncing') return { ...base, state: 'syncing' };
  if (snap.phase === 'error') return { ...base, state: 'error' };
  return { ...base, state: 'idle' };
}
