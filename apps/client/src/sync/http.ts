import { apiError, SYNC_RETRY_DELAYS_MS, SYNC_TIMEOUT_MS } from '@nexo/shared';
import type { ZodType } from 'zod';
import { API_URL } from '../config';
import { getSettings } from '../db';

/** `status` 0 = sem resposta do servidor (`network` ou `timeout`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? `${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Ajustável só pelos testes (para não esperar 1, 2, 4... s de verdade). */
export const httpConfig: { retryDelaysMs: readonly number[] } = {
  retryDelaysMs: SYNC_RETRY_DELAYS_MS,
};

export interface Credentials {
  code: string;
  key: string;
}

export type ApiInit<T> = RequestInit & {
  schema: ZodType<T>;
  /** `true` usa o participante salvo; um objeto usa essas credenciais. */
  auth?: boolean | Credentials;
  timeoutMs?: number;
  /** Cancela a requisição e qualquer espera de retry (code `aborted`, nunca retentado). */
  signal?: AbortSignal;
  /** Chamado antes de cada nova tentativa; `false` cancela (ex.: consentimento revogado). */
  guard?: () => Promise<boolean>;
  /** `false` desliga as novas tentativas (ex.: POST não idempotente, login). Padrão: `true`. */
  retry?: boolean;
};

const retryable = (e: ApiError) =>
  (e.status === 0 && e.code !== 'aborted') || e.status === 429 || e.status >= 500;

/** Espera `ms`; se `signal` abortar antes, rejeita na hora e cancela o timer. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError(0, 'aborted'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError(0, 'aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function credentialsFor(
  auth: boolean | Credentials | undefined,
): Promise<Credentials | null> {
  if (!auth) return null;
  if (typeof auth === 'object') return auth;
  const participant = (await getSettings()).participant;
  if (!participant) throw new ApiError(401, 'no_participant');
  return participant;
}

async function attempt<T>(url: string, init: ApiInit<T>, headers: Headers): Promise<T> {
  const { schema, timeoutMs, signal: outer, ...rest } = init;
  delete (rest as { auth?: unknown }).auth;
  delete (rest as { guard?: unknown }).guard;
  delete (rest as { retry?: unknown }).retry;
  if (outer?.aborted) throw new ApiError(0, 'aborted');
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? SYNC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: Object.fromEntries(headers),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted =
      controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError');
    if (outer?.aborted) throw new ApiError(0, 'aborted');
    throw new ApiError(0, aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const parsed = apiError.safeParse(body);
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error : `http_${res.status}`,
      parsed.success ? parsed.data.message : undefined,
    );
  }
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => null);
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError(res.status, 'bad_response');
  return result.data;
}

/** Retenta só rede, timeout, 5xx e 429; 4xx volta direto como `ApiError`. */
export async function apiFetch<T>(path: string, init: ApiInit<T>): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const creds = await credentialsFor(init.auth);
  if (creds) {
    headers.set('x-participant-code', creds.code);
    headers.set('x-participant-key', creds.key);
  }
  const url = `${API_URL}${path}`;
  const delays = httpConfig.retryDelaysMs;
  for (let i = 0; ; i++) {
    try {
      return await attempt(url, init, headers);
    } catch (e) {
      const delay = delays[i];
      if (!(e instanceof ApiError) || init.retry === false || !retryable(e) || delay === undefined)
        throw e;
      await sleep(delay, init.signal);
      if (init.signal?.aborted || (init.guard && !(await init.guard()))) {
        throw new ApiError(0, 'aborted');
      }
    }
  }
}
