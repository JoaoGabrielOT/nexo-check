import {
  CONSENT_VERSION,
  SYNC_INTERVAL_MS,
  checkinResponse,
  generateParticipantCode,
  getQuestionnaire,
  normalizeCode,
  normalizeRecoveryKey,
  questionnaireSubmitResponse,
  stripTextAnswers,
  syncPullResponse,
  syncPushResponse,
} from '@nexo/shared';
import { z } from 'zod';
import {
  ackOutbox,
  applyRemoteChanges,
  db,
  getSettings,
  backfillHistory,
  outboxCount,
  peekOutbox,
  updateCheckinStatus,
  updateSettings,
  clearOutbox,
} from '../db';
import { now } from '../db/clock';
import { onLocalWrite } from '../db/localWrites';
import type { AppSettings } from '../db/schemas';
import { ApiError, apiFetch, type ApiInit, type Credentials } from './http';

export type SyncResult = 'synced' | 'skipped' | 'offline' | 'error';
export type SyncPhase = 'idle' | 'syncing' | 'error' | 'offline';
export type SyncErrorCode = 'unauthorized' | 'rejected' | 'clock_skew' | 'network' | 'server';

export interface SyncSnapshot {
  phase: SyncPhase;
  error: SyncErrorCode | null;
}

const BATCH = 500;
const REGISTER_TRIES = 3;
/** Cursor alto: a sondagem de credenciais não traz nenhuma mudança. */
const PROBE_CURSOR = '999999999999999999';
const LOCAL_WRITE_DEBOUNCE_MS = 5000;

// --- estado observável (useSyncStatus) ---------------------------------------------------------

let snapshot: SyncSnapshot = { phase: 'idle', error: null };
const subscribers = new Set<() => void>();

function setSnapshot(next: SyncSnapshot): void {
  if (next.phase === snapshot.phase && next.error === snapshot.error) return;
  snapshot = next;
  for (const s of [...subscribers]) s();
}

export const getSyncSnapshot = (): SyncSnapshot => snapshot;

export function subscribeSyncState(listener: () => void): () => void {
  subscribers.add(listener);
  return () => void subscribers.delete(listener);
}

// --- utilidades --------------------------------------------------------------------------------

/** Lançado quando o consentimento some no meio de uma sincronização. */
class Revoked extends Error {}

const isConsented = (s: AppSettings): boolean =>
  s.consent?.granted === true && s.consent.version >= CONSENT_VERSION && s.participant !== null;

async function requireConsent(): Promise<
  AppSettings & { participant: Credentials & { registered: boolean } }
> {
  const s = await getSettings();
  if (!isConsented(s) || !s.participant) throw new Revoked();
  return { ...s, participant: s.participant };
}

/** Falhas que interrompem tudo: rede, 5xx, 429 e 401. Um 400/409/etc. só afeta o item. */
const isFatal = (e: unknown): boolean =>
  !(e instanceof ApiError) ||
  e.status === 401 ||
  e.status === 0 ||
  e.status === 429 ||
  e.status >= 500;

function errorCodeOf(e: unknown): SyncErrorCode {
  if (!(e instanceof ApiError)) return 'server';
  if (e.status === 401) return 'unauthorized';
  if (e.status === 0) return 'network';
  if (e.code === 'clock_skew') return 'clock_skew';
  return e.status >= 500 || e.status === 429 ? 'server' : 'rejected';
}

const anyAck = z.unknown();

/** Execução em andamento: `revokeConsent` a aborta na hora (requisições e esperas de retry). */
let current: AbortController | null = null;

const stillConsented = async (): Promise<boolean> => isConsented(await getSettings());

/** Requisição de dados do participante: cancelável e que reconfere o consentimento a cada retry. */
function call<T>(path: string, init: ApiInit<T>): Promise<T> {
  return apiFetch(path, { ...init, signal: current?.signal, guard: stillConsented });
}

const isAborted = (e: unknown): boolean => e instanceof ApiError && e.code === 'aborted';

/** Trava única: sincronização e restauração nunca rodam ao mesmo tempo. */
let lockTail: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lockTail;
  let release!: () => void;
  lockTail = new Promise<void>((resolve) => (release = resolve));
  return prev.then(fn).finally(release);
}

// --- etapas ------------------------------------------------------------------------------------

/** O servidor aceita estas credenciais? (um GET barato; 401 = não, outro erro propaga.) */
async function credentialsWork(creds: Credentials): Promise<boolean> {
  try {
    await call(`/v1/sync?since=${PROBE_CURSOR}`, {
      method: 'GET',
      auth: creds,
      schema: syncPullResponse,
    });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return false;
    throw e;
  }
}

async function register(): Promise<void> {
  const { consent, participant: current } = await requireConsent();
  let participant = current;
  if (participant.registered || !consent) return;
  for (let i = 0; i < REGISTER_TRIES; i++) {
    try {
      await call('/v1/participants', {
        method: 'POST',
        body: JSON.stringify({
          code: participant.code,
          key: participant.key,
          consentVersion: consent.version,
        }),
        schema: anyAck,
        retryOn429: false,
      });
      await updateSettings({
        participant: { ...participant, registered: true },
        consentSyncedVersion: consent.version,
      });
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'code_taken' || i === REGISTER_TRIES - 1) throw e;
      // O POST anterior pode ter gravado e a resposta se perdido: se as credenciais deste
      // aparelho autenticam, o cadastro já existe (a versão do consentimento é reenviada depois).
      if (await credentialsWork(participant)) {
        await updateSettings({ participant: { ...participant, registered: true } });
        return;
      }
      // Colisão de verdade: só o código muda; a chave gerada no aparelho continua a mesma.
      participant = { ...participant, code: generateParticipantCode() };
      await updateSettings({ participant });
    }
  }
}

async function syncConsentVersion(): Promise<void> {
  const { consent, consentSyncedVersion } = await requireConsent();
  if (!consent || (consentSyncedVersion ?? 0) >= consent.version) return;
  await call('/v1/participants/me/consent', {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ consentVersion: consent.version }),
    schema: anyAck,
  });
  await updateSettings({ consentSyncedVersion: consent.version });
}

async function push(): Promise<void> {
  for (;;) {
    await requireConsent();
    const batch = await peekOutbox(BATCH);
    if (batch.length === 0) return;
    // O cursor devolvido pelo POST é só informativo: nunca serve de cursor do pull.
    await call('/v1/sync', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ changes: batch.map((b) => b.change) }),
      schema: syncPushResponse,
    });
    await ackOutbox(batch.map((b) => b.seq));
  }
}

/** Baixa tudo desde `since`, aplicando e gravando o cursor a cada página. */
async function pullAll(
  since: string,
  fetchPage: (cursor: string) => Promise<z.infer<typeof syncPullResponse>>,
  hooks: { beforePage?: () => Promise<void>; onFirstPage?: () => Promise<void> } = {},
): Promise<void> {
  let cursor = since;
  let first = true;
  for (;;) {
    await hooks.beforePage?.();
    const page = await fetchPage(cursor);
    // A resposta pode chegar depois de uma revogação: não grava nada nesse caso.
    await hooks.beforePage?.();
    if (first) await hooks.onFirstPage?.();
    first = false;
    await applyRemoteChanges(page.changes);
    await updateSettings({ syncCursor: page.cursor });
    if (!page.hasMore) return;
    if (page.cursor === cursor) throw new ApiError(200, 'bad_response', 'cursor não avançou');
    cursor = page.cursor;
  }
}

async function sendQuestionnaires(soft: (e: unknown) => void): Promise<void> {
  const pending = (await db.questionnaireResponses.toArray()).filter((r) => r.syncedAt === null);
  for (const r of pending) {
    await requireConsent();
    try {
      const answers = stripTextAnswers(getQuestionnaire(r.kind), r.answers);
      const res = await call('/v1/questionnaires', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          id: r.id,
          kind: r.kind,
          version: r.version,
          answers,
          submittedAt: r.submittedAt,
        }),
        schema: questionnaireSubmitResponse,
      });
      await db.questionnaireResponses.update(r.id, {
        syncedAt: now().toISOString(),
        ...(res.score !== null && { score: res.score }),
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 400)) {
        // 409: o servidor já tem uma resposta com este id. 400: erro de validação determinístico.
        // Reenviar nunca muda isso: marca como tratada, com o flag, numa só gravação.
        if (e.status === 400) console.warn('Sincronização: questionário recusado', e);
        await db.questionnaireResponses.update(r.id, {
          syncedAt: now().toISOString(),
          syncConflict: true,
        });
      } else if (isFatal(e)) throw e;
      else soft(e);
    }
  }
}

async function sendCheckins(soft: (e: unknown) => void): Promise<void> {
  const pending = (await db.checkins.toArray()).filter(
    (c) => c.status === 'pending' && c.syncedAt === null,
  );
  for (const c of pending) {
    await requireConsent();
    const at = now().toISOString();
    try {
      const res = await call('/v1/checkins', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ sessionCode: c.sessionCode, clientId: c.id }),
        schema: checkinResponse,
      });
      await updateCheckinStatus(c.id, {
        status: 'confirmed',
        reason: null,
        workshop: res.workshop,
        date: res.date,
        syncedAt: at,
      });
    } catch (e) {
      // Só os códigos de negócio rejeitam; qualquer outro 404/410 (proxy, rota errada) fica pendente.
      const reason =
        e instanceof ApiError && e.status === 404 && e.code === 'invalid_code'
          ? 'invalid_code'
          : e instanceof ApiError && e.status === 410 && e.code === 'expired'
            ? 'expired'
            : null;
      if (reason) {
        await updateCheckinStatus(c.id, {
          status: 'rejected',
          reason,
          syncedAt: at,
        });
      } else if (isFatal(e)) throw e;
      else soft(e);
    }
  }
}

// --- API pública -------------------------------------------------------------------------------

/**
 * Com `registered` e 401, a conta pode ter sido apagada no servidor (backup restaurado depois
 * de uma exclusão). Tenta cadastrar de novo com o mesmo código e chave: 201 = conta nova, então
 * o histórico precisa ser reenviado; qualquer outra resposta mantém o erro de autenticação.
 */
async function reregister(): Promise<boolean> {
  try {
    const { consent, participant } = await requireConsent();
    if (!consent || !participant.registered) return false;
    await call('/v1/participants', {
      method: 'POST',
      body: JSON.stringify({
        code: participant.code,
        key: participant.key,
        consentVersion: consent.version,
      }),
      schema: anyAck,
      retryOn429: false,
    });
    await updateSettings({
      syncCursor: null,
      consentSyncedVersion: undefined,
      backfillPending: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function run(allowReregister = true): Promise<SyncResult> {
  const settings = await getSettings();
  if (!isConsented(settings)) {
    setSnapshot({ phase: 'idle', error: null });
    return 'skipped';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSnapshot({ phase: 'offline', error: null });
    return 'offline';
  }
  setSnapshot({ phase: 'syncing', error: null });
  const controller = new AbortController();
  current = controller;
  let softError: SyncErrorCode | null = null;
  const soft = (e: unknown) => {
    // Rejeição de um item (400 etc.): registra, mantém o item e segue com o resto.
    console.warn('Sincronização: item recusado pelo servidor', e);
    softError ??= errorCodeOf(e);
  };
  try {
    await register();
    await syncConsentVersion();
    if ((await requireConsent()).backfillPending) await backfillHistory();
    try {
      await push();
    } catch (e) {
      if (isFatal(e)) throw e;
      soft(e);
    }
    const { syncCursor } = await requireConsent();
    await pullAll(
      syncCursor ?? '0',
      (cursor) =>
        call(`/v1/sync?since=${encodeURIComponent(cursor)}`, {
          method: 'GET',
          auth: true,
          schema: syncPullResponse,
        }),
      { beforePage: async () => void (await requireConsent()) },
    );
    await sendQuestionnaires(soft);
    await sendCheckins(soft);
  } catch (e) {
    if (e instanceof Revoked || isAborted(e)) {
      setSnapshot({ phase: 'idle', error: null });
      return 'skipped';
    }
    if (e instanceof ApiError && e.status === 0 && navigator.onLine === false) {
      setSnapshot({ phase: 'offline', error: null });
      return 'offline';
    }
    if (allowReregister && e instanceof ApiError && e.status === 401 && (await reregister())) {
      return run(false);
    }
    console.warn('Sincronização falhou', e);
    setSnapshot({ phase: 'error', error: errorCodeOf(e) });
    return 'error';
  }
  if (softError) {
    setSnapshot({ phase: 'error', error: softError });
    return 'error';
  }
  if (!(await stillConsented())) return 'skipped';
  await updateSettings({ lastSyncAt: now().toISOString() });
  setSnapshot({ phase: 'idle', error: null });
  return 'synced';
}

let inflight: Promise<SyncResult> | null = null;

/** Uma execução por vez: chamadas simultâneas esperam a mesma promessa. */
export function syncNow(): Promise<SyncResult> {
  inflight ??= withLock(() => run()).finally(() => {
    inflight = null;
    current = null;
  });
  return inflight;
}

/** Como `syncNow`, mas se já há uma execução em andamento roda outra logo depois (escrita nova). */
export function requestSync(): Promise<SyncResult> {
  return inflight
    ? inflight.then(
        () => syncNow(),
        () => syncNow(),
      )
    : syncNow();
}

/** Gatilhos: início, volta da conexão, intervalo (aba visível), aba visível e escritas locais. */
export function startSyncLoop(): () => void {
  const visible = () => document.visibilityState === 'visible';
  const trigger = () => void syncNow().catch(() => undefined);
  const refreshOffline = () => {
    if (navigator.onLine === false) {
      if (snapshot.phase !== 'syncing') setSnapshot({ phase: 'offline', error: null });
    } else if (snapshot.phase === 'offline') setSnapshot({ phase: 'idle', error: null });
  };
  const onOnline = () => {
    refreshOffline();
    trigger();
  };
  const onVisible = () => visible() && trigger();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const offWrites = onLocalWrite(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void requestSync().catch(() => undefined), LOCAL_WRITE_DEBOUNCE_MS);
  });
  const interval = setInterval(() => visible() && trigger(), SYNC_INTERVAL_MS);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', refreshOffline);
  document.addEventListener('visibilitychange', onVisible);
  trigger();
  return () => {
    clearTimeout(debounce);
    clearInterval(interval);
    offWrites();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', refreshOffline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** O aparelho tem outro participante com dados ainda não enviados (fila, questionários, check-ins). */
export class RestoreBlockedError extends Error {
  constructor() {
    super('Restauração bloqueada: há dados pendentes de outro participante.');
    this.name = 'RestoreBlockedError';
  }
}

/** Restaurar outra conta mexeria em dados locais ou numa conta cadastrada: precisa de confirmação. */
export class RestoreNeedsConfirmError extends Error {
  constructor() {
    super('Restauração exige confirmação: há dados locais ou outra conta cadastrada.');
    this.name = 'RestoreNeedsConfirmError';
  }
}

export interface RestoreOptions {
  /** Confirmado pela pessoa: apaga a conta atual (servidor) e os dados do aparelho antes. */
  replaceLocal?: boolean;
}

async function hasPendingData(): Promise<boolean> {
  if ((await outboxCount()) > 0) return true;
  if ((await db.questionnaireResponses.toArray()).some((r) => r.syncedAt === null)) return true;
  return (await db.checkins.toArray()).some((c) => c.status === 'pending' && c.syncedAt === null);
}

/** Dados da pessoa no aparelho; só os hábitos padrão, intactos, não contam. */
async function hasLocalData(): Promise<boolean> {
  const counts = await Promise.all([
    db.habitEntries.count(),
    db.dailyLogs.count(),
    db.questionnaireResponses.count(),
    db.checkins.count(),
  ]);
  if (counts.some((n) => n > 0)) return true;
  const habits = await db.habits.toArray();
  // Os padrão nascem juntos (mesmo updatedAt); editar, criar ou apagar um desfaz isso.
  return (
    habits.some((h) => h.key === null || h.deletedAt !== null) ||
    new Set(habits.map((h) => h.updatedAt)).size > 1
  );
}

/** Esvazia as tabelas de dados e o outbox; as configurações ficam. */
async function wipeLocalData(): Promise<void> {
  const tables = db.tables.filter((t) => t.name !== 'settings');
  await db.transaction('rw', tables, () => Promise.all(tables.map((t) => t.clear())));
}

async function restoreLocked(code: string, key: string, opts: RestoreOptions): Promise<void> {
  const creds: Credentials = { code: normalizeCode(code), key: normalizeRecoveryKey(key) };
  const local = (await getSettings()).participant;
  const otherAccount = local === null || local.code !== creds.code;
  // Trocar de participante com pendências enviaria os dados de um para a conta do outro.
  if (otherAccount && local && (await hasPendingData())) throw new RestoreBlockedError();
  const hasData = otherAccount ? await hasLocalData() : false;
  const replace = otherAccount && (hasData || local?.registered === true);
  if (replace && !opts.replaceLocal) throw new RestoreNeedsConfirmError();
  if (replace) {
    // Confere as credenciais novas antes de apagar qualquer coisa.
    await apiFetch(`/v1/sync?since=${PROBE_CURSOR}`, {
      method: 'GET',
      auth: creds,
      schema: syncPullResponse,
    });
    if (local?.registered) {
      // 401: a conta atual já não existe no servidor; qualquer outra falha cancela a troca.
      await deleteRemoteParticipant().catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      });
    }
    await wipeLocalData();
    await updateSettings({ participant: null, syncCursor: null, consentSyncedVersion: undefined });
  } else if (otherAccount) {
    // Só hábitos padrão: os da conta restaurada substituem, em vez de somar.
    await db.habits.clear();
  }
  await pullAll(
    '0',
    (cursor) =>
      apiFetch(`/v1/sync?since=${encodeURIComponent(cursor)}`, {
        method: 'GET',
        auth: creds,
        schema: syncPullResponse,
      }),
    {
      // Primeira página aceita = credenciais válidas.
      onFirstPage: () =>
        updateSettings({
          participant: { ...creds, registered: true },
          syncCursor: null,
          consentSyncedVersion: undefined,
        }),
    },
  );
}

/** Restaura em outro aparelho: valida as credenciais com um pull e baixa tudo. Lança `ApiError`. */
export function restoreFromServer(
  code: string,
  key: string,
  opts: RestoreOptions = {},
): Promise<void> {
  return withLock(() => restoreLocked(code, key, opts));
}

/**
 * Revoga o consentimento: aborta a sincronização em andamento (requisições e esperas de retry),
 * descarta o outbox e, se pedido, apaga os dados no servidor. Não espera a execução terminar.
 */
export async function revokeConsent(opts: { deleteRemote?: boolean } = {}): Promise<void> {
  // Sem consentimento a próxima sincronização refaz o histórico (backfill) ao reconsentir.
  await updateSettings({ consent: null, backfillPending: true });
  current?.abort();
  await clearOutbox();
  setSnapshot({ phase: 'idle', error: null });
  if (opts.deleteRemote) await deleteRemoteParticipant();
}

/** Apaga os dados do participante no servidor (LGPD) e volta a marcá-lo como não registrado. */
export async function deleteRemoteParticipant(): Promise<void> {
  const participant = (await getSettings()).participant;
  if (!participant) return;
  await apiFetch('/v1/participants/me', {
    method: 'DELETE',
    auth: participant,
    schema: z.void(),
  });
  await updateSettings({
    participant: { ...participant, registered: false },
    syncCursor: null,
    lastSyncAt: null,
    consentSyncedVersion: undefined,
    backfillPending: true,
  });
}
