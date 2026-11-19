import { adminLoginResponse, sessionView } from '@nexo/shared';
import { z } from 'zod';
import { API_URL } from '../../config';
import { ApiError, apiFetch } from '../../sync/http';

const TOKEN_KEY = 'nexo-admin-token';

// O token vive só no sessionStorage (some ao fechar a aba); se o navegador o bloquear, a sessão
// admin simplesmente não persiste.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* sem armazenamento: o token fica só na memória da tela */
  }
}
export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nada a limpar */
  }
}

const indicator = z.object({
  id: z.enum([
    'participation',
    'comprehension',
    'acceptance',
    'adherence',
    'stress',
    'activity_frequency',
  ]),
  value: z.string(),
  target: z.string(),
  status: z.enum(['below', 'met', 'comparison']),
  n: z.number(),
  smallSample: z.boolean(),
  detail: z.record(z.string(), z.number().nullable()).optional(),
});
const stats = z.object({
  indicators: z.array(indicator),
  generatedAt: z.string(),
  totals: z.object({ participants: z.number(), sessions: z.number() }),
});
export type AdminStats = z.infer<typeof stats>;
export type AdminIndicator = z.infer<typeof indicator>;
export type { SessionView } from '@nexo/shared';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const jsonInit = (token: string, method: string, body?: unknown) => ({
  method,
  headers: bearer(token),
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const adminLogin = (password: string) =>
  apiFetch('/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    schema: adminLoginResponse,
  }).then((r) => r.token);

export const listSessions = (token: string) =>
  apiFetch('/v1/admin/sessions', { ...jsonInit(token, 'GET'), schema: z.array(sessionView) });

export const createSession = (
  token: string,
  body: { workshop: 1 | 2; date: string; location: string },
) => apiFetch('/v1/admin/sessions', { ...jsonInit(token, 'POST', body), schema: sessionView });

export const setManualCount = (token: string, id: string, manualCount: number) =>
  apiFetch(`/v1/admin/sessions/${encodeURIComponent(id)}/manual`, {
    ...jsonInit(token, 'PATCH', { manualCount }),
    schema: sessionView,
  });

export const deleteSession = (token: string, id: string) =>
  apiFetch(`/v1/admin/sessions/${encodeURIComponent(id)}`, {
    ...jsonInit(token, 'DELETE'),
    schema: z.undefined(),
  });

export const getStats = (token: string) =>
  apiFetch('/v1/admin/stats', { ...jsonInit(token, 'GET'), schema: stats });

/** Baixa o CSV com o token; o nome vem do cabeçalho do servidor. O BOM é mantido (Excel). */
export async function fetchCsv(token: string): Promise<{ name: string; content: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/admin/export.csv`, { headers: bearer(token) });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) throw new ApiError(res.status, `http_${res.status}`);
  const content = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
  return { name: name ?? 'nexo-indicadores.csv', content };
}
