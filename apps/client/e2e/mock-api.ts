import type { Page, Route } from '@playwright/test';

export const API_ORIGIN = 'http://api.test';
export const ADMIN_PASSWORD = 'senha-do-grupo';

const SESSION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

interface MockSession {
  id: string;
  workshop: 1 | 2;
  date: string;
  location: string;
  code: string;
  checkinUrl: string;
  expiresAt: string;
  checkins: number;
  manualCount: number;
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,x-participant-code,x-participant-key',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-disposition',
};

const json = (status: number, body: unknown) => ({
  status,
  headers: { ...cors, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const fail = (status: number, error: string, message: string) => json(status, { error, message });

const randomCode = () =>
  Array.from(
    { length: 6 },
    () => SESSION_ALPHABET[Math.floor(Math.random() * SESSION_ALPHABET.length)],
  ).join('');

/**
 * API falsa, em memória, com os endpoints que os fluxos usam e códigos de status realistas.
 * Guarda todas as requisições recebidas para as specs conferirem (ex.: nada enviado sem consentimento).
 */
export class MockApi {
  readonly requests: RecordedRequest[] = [];
  private readonly participants = new Map<string, string>();
  private readonly sessions: MockSession[] = [];
  private checkinGate: Promise<void> | null = null;
  private releaseCheckinGate: (() => void) | null = null;

  /** Cria uma sessão de oficina que os check-ins conseguem confirmar. */
  seedSession(code: string, workshop: 1 | 2 = 1): void {
    this.sessions.push(this.buildSession(code, workshop, '2026-01-15', 'Sala 101'));
  }

  /** Segura as respostas de `POST /v1/checkins` até `releaseCheckins()` (para ver o estado pendente). */
  holdCheckins(): void {
    this.checkinGate = new Promise((resolve) => (this.releaseCheckinGate = resolve));
  }

  releaseCheckins(): void {
    this.releaseCheckinGate?.();
    this.checkinGate = null;
  }

  /** Requisições que casam com `METHOD /caminho` (o caminho ignora a query string). */
  received(route: string): RecordedRequest[] {
    const [method, path] = route.split(' ');
    return this.requests.filter((r) => r.method === method && r.path === path);
  }

  /** Mudanças de sincronização já enviadas, de todos os `POST /v1/sync`. */
  pushedChanges(): { entity: string; payload: Record<string, unknown> }[] {
    return this.received('POST /v1/sync').flatMap(
      (r) =>
        (r.body as { changes: { entity: string; payload: Record<string, unknown> }[] }).changes,
    );
  }

  async install(page: Page): Promise<void> {
    await page.route(`${API_ORIGIN}/**`, (route) => this.handle(route));
  }

  private buildSession(code: string, workshop: 1 | 2, date: string, location: string): MockSession {
    return {
      id: `sess-${this.sessions.length + 1}`,
      workshop,
      date,
      location,
      code,
      checkinUrl: `http://localhost:4173/checkin?c=${code}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
      checkins: 0,
      manualCount: 0,
    };
  }

  private adminAuthorized(headers: Record<string, string>): boolean {
    return headers['authorization'] === 'Bearer token-de-teste';
  }

  private participantAuthorized(headers: Record<string, string>): boolean {
    const code = headers['x-participant-code'];
    const key = headers['x-participant-key'];
    return code !== undefined && key !== undefined && this.participants.get(code) === key;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    const headers = request.headers();
    let body: unknown = null;
    const raw = request.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const path = url.pathname;
    this.requests.push({ method, path, headers, body });
    return route.fulfill(await this.respond(method, path, url, headers, body));
  }

  private async respond(
    method: string,
    path: string,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ) {
    const key = `${method} ${path}`;

    if (key === 'POST /v1/participants') {
      const { code, key: secret } = body as { code: string; key: string };
      if (this.participants.has(code)) return fail(409, 'code_taken', 'Código já usado.');
      this.participants.set(code, secret);
      return json(201, { ok: true });
    }

    // Rotas de admin.
    if (key === 'POST /v1/admin/login') {
      const { password } = body as { password: string };
      return password === ADMIN_PASSWORD
        ? json(200, { token: 'token-de-teste' })
        : fail(401, 'unauthorized', 'Senha incorreta.');
    }
    if (path.startsWith('/v1/admin/')) {
      if (!this.adminAuthorized(headers)) return fail(401, 'unauthorized', 'Sessão expirada.');
      if (key === 'GET /v1/admin/sessions') return json(200, this.sessions);
      if (key === 'POST /v1/admin/sessions') {
        const { workshop, date, location } = body as {
          workshop: 1 | 2;
          date: string;
          location: string;
        };
        const session = this.buildSession(randomCode(), workshop, date, location);
        this.sessions.push(session);
        return json(201, session);
      }
      if (key === 'GET /v1/admin/stats') return json(200, this.stats());
      if (key === 'GET /v1/admin/export.csv') {
        return {
          status: 200,
          headers: {
            ...cors,
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="nexo-indicadores.csv"',
          },
          body: '﻿indicador,valor\nparticipacao,80%\n',
        };
      }
      return fail(404, 'not_found', 'Rota não encontrada.');
    }

    // Rotas do participante: exigem código e chave registrados.
    if (path.startsWith('/v1/') && !this.participantAuthorized(headers)) {
      return fail(401, 'unauthorized', 'Credenciais inválidas.');
    }
    if (key === 'PATCH /v1/participants/me/consent') return json(200, { ok: true });
    if (key === 'DELETE /v1/participants/me') {
      this.participants.delete(headers['x-participant-code'] ?? '');
      return { status: 204, headers: cors };
    }
    if (key === 'POST /v1/sync') {
      const { changes } = body as { changes: unknown[] };
      return json(200, { applied: changes.length, cursor: String(this.pushedChanges().length) });
    }
    if (key === 'GET /v1/sync') {
      return json(200, {
        changes: [],
        cursor: url.searchParams.get('since') ?? '0',
        hasMore: false,
      });
    }
    if (key === 'POST /v1/questionnaires') return json(201, { score: null });
    if (key === 'POST /v1/checkins') {
      await this.checkinGate;
      const { sessionCode } = body as { sessionCode: string };
      const session = this.sessions.find((s) => s.code === sessionCode);
      if (!session) return fail(404, 'invalid_code', 'Código inválido.');
      session.checkins += 1;
      return json(201, { status: 'confirmed', workshop: session.workshop, date: session.date });
    }
    return fail(404, 'not_found', 'Rota não encontrada.');
  }

  private stats() {
    const indicator = (
      id: string,
      value: string,
      target: string,
      status: 'met' | 'below' | 'comparison',
      n: number,
    ) => ({ id, value, target, status, n, smallSample: n < 10 });
    return {
      generatedAt: new Date().toISOString(),
      totals: { participants: 12, sessions: this.sessions.length },
      indicators: [
        {
          ...indicator('participation', '80%', '≥ 70%', 'met', 12),
          detail: { checkins: 9, manual: 1 },
        },
        indicator('comprehension', '75%', '≥ 70%', 'met', 12),
        indicator('acceptance', '4,2 de 5', '≥ 4', 'met', 11),
        {
          ...indicator('adherence', '60%', '≥ 50%', 'met', 12),
          detail: { checklistMovement: 0.6 },
        },
        indicator('stress', 'antes 3,4 → depois 2,9', 'comparação', 'comparison', 8),
        indicator('activity_frequency', 'antes 2,1 → depois 3,0', 'comparação', 'comparison', 8),
      ],
    };
  }
}
