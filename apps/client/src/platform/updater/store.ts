import { useSyncExternalStore } from 'react';
import { UPDATE_CHECK_INTERVAL_MS } from '@nexo/shared';
import { PLATFORM, type Platform } from '../runtime';
import { createDefaultAndroidUpdater } from './android';
import {
  UpdateCheckError,
  type InstallProgress,
  type UpdateCandidate,
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
// A versão e o asset que o diálogo está mostrando; o install usa exatamente este.
let accepted: UpdateCandidate | null = null;

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
  accepted = null;
  inFlight = null;
  androidAdapter = undefined;
}

type CheckResult = 'available' | 'none' | 'error' | 'rate_limited' | 'unsupported' | 'busy';
let inFlight: Promise<CheckResult> | null = null;

/** Verifica se há versão nova. Chamadas simultâneas compartilham a mesma consulta. */
export function checkForUpdates(): Promise<CheckResult> {
  const adapter = getActiveUpdater();
  if (!adapter) return Promise.resolve('unsupported');
  if (state.status === 'downloading') return Promise.resolve('busy');
  if (Date.now() < blockedUntil) return Promise.resolve('rate_limited');
  inFlight ??= runCheck(adapter).finally(() => (inFlight = null));
  return inFlight;
}

async function runCheck(adapter: UpdaterAdapter): Promise<CheckResult> {
  try {
    const found = await adapter.check();
    // Só o estado ocioso (ou um aviso de outra versão) aceita o resultado; qualquer outro está em
    // uso pelo diálogo e não pode ser rebaixado nem trocar o asset no meio do caminho.
    const current: UpdaterState = state;
    if (current.status !== 'idle' && current.status !== 'available') return 'busy';
    if (!found) return current.status === 'available' ? 'available' : 'none';
    if (current.status === 'idle' || current.info.version !== found.info.version) {
      accepted = found;
      setState({ status: 'available', info: found.info });
    }
    return 'available';
  } catch (e) {
    if (e instanceof UpdateCheckError && (e.status === 403 || e.status === 429)) {
      blockedUntil = Date.now() + UPDATE_CHECK_INTERVAL_MS;
      return 'rate_limited';
    }
    return 'error';
  }
}

export async function installUpdate(): Promise<void> {
  const adapter = getActiveUpdater();
  const candidate = accepted;
  if (!adapter || !candidate || state.status === 'idle' || state.status === 'downloading') return;
  const info: UpdateInfo = candidate.info;
  setState({ status: 'downloading', info, progress: { downloaded: 0, total: null } });
  const onProgress = (progress: InstallProgress) => {
    if (state.status === 'downloading') setState({ status: 'downloading', info, progress });
  };
  try {
    const outcome = await adapter.install(candidate, onProgress);
    if (outcome === 'needs_permission') setState({ status: 'needs_permission', info });
    else if (outcome === 'ready') setState({ status: 'ready', info });
    else {
      accepted = null;
      setState(IDLE);
    }
  } catch {
    setState({ status: 'error', info });
  }
}

export function dismissUpdate(): void {
  if (state.status === 'downloading') return;
  accepted = null;
  setState(IDLE);
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
