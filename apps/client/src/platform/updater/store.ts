import { useSyncExternalStore } from 'react';
import { UPDATE_CHECK_INTERVAL_MS } from '@nexo/shared';
import { PLATFORM, type Platform } from '../runtime';
import { createDefaultAndroidUpdater } from './android';
import {
  UpdateCheckError,
  type InstallProgress,
  type UpdateInfo,
  type UpdaterAdapter,
  type UpdaterState,
} from './types';

const IDLE: UpdaterState = { status: 'idle' };
let state: UpdaterState = IDLE;
const listeners = new Set<() => void>();
let override: UpdaterAdapter | null | undefined;
let androidAdapter: UpdaterAdapter | undefined;
// Depois de 403/429 da API do GitHub (limite de requisições) não se consulta de novo até esta hora.
let blockedUntil = 0;

function setState(next: UpdaterState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Web não tem atualizador (usa o service worker). O lado Windows entra aqui (Task 4). */
export function getUpdaterAdapter(platform: Platform = PLATFORM): UpdaterAdapter | null {
  if (platform === 'android') return (androidAdapter ??= createDefaultAndroidUpdater());
  return null;
}

/** O adaptador em uso: o da plataforma, ou o dos testes. */
export function getActiveUpdater(): UpdaterAdapter | null {
  return override === undefined ? getUpdaterAdapter() : override;
}

export function setUpdaterAdapterForTests(a: UpdaterAdapter | null | undefined): void {
  override = a;
}

export function resetUpdaterForTests(): void {
  state = IDLE;
  blockedUntil = 0;
  androidAdapter = undefined;
}

const isDownloading = () => state.status === 'downloading';

export async function checkForUpdates(): Promise<
  'available' | 'none' | 'error' | 'unsupported' | 'busy'
> {
  const adapter = getActiveUpdater();
  if (!adapter) return 'unsupported';
  if (state.status === 'downloading') return 'busy';
  if (Date.now() < blockedUntil) return 'error';
  try {
    const info = await adapter.check();
    if (!info) return 'none';
    // Uma instalação pode ter começado durante a consulta.
    if (isDownloading()) return 'busy';
    setState({ status: 'available', info });
    return 'available';
  } catch (e) {
    if (e instanceof UpdateCheckError && (e.status === 403 || e.status === 429)) {
      blockedUntil = Date.now() + UPDATE_CHECK_INTERVAL_MS;
    }
    return 'error';
  }
}

export async function installUpdate(): Promise<void> {
  const adapter = getActiveUpdater();
  if (!adapter || state.status === 'idle' || state.status === 'downloading') return;
  const info: UpdateInfo = state.info;
  setState({ status: 'downloading', info, progress: { downloaded: 0, total: null } });
  const onProgress = (progress: InstallProgress) => {
    if (state.status === 'downloading') setState({ status: 'downloading', info, progress });
  };
  try {
    const outcome = await adapter.install(onProgress);
    if (outcome === 'needs_permission') setState({ status: 'needs_permission', info });
    else if (outcome === 'ready') setState({ status: 'ready', info });
    else setState(IDLE);
  } catch {
    setState({ status: 'error', info });
  }
}

export function dismissUpdate(): void {
  if (state.status !== 'downloading') setState(IDLE);
}

export function useUpdaterState(): UpdaterState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
