import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuestionnaire, questionnaireKind, type Answers, type SyncChange } from '@nexo/shared';
import { resetDbForTests } from '../../src/db/db';
import {
  addCheckin,
  db,
  getSettings,
  outboxCount,
  saveQuestionnaireResponse,
  updateSettings,
} from '../../src/db';
import { httpConfig } from '../../src/sync/http';
import {
  deleteRemoteParticipant,
  getSyncSnapshot,
  restoreFromServer,
  revokeConsent,
  syncNow,
} from '../../src/sync/engine';

const KEY = 'K'.repeat(24);
const NOW = '2026-11-18T10:00:00.000Z';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));

const json = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const err = (status: number, error: string) => json(status, { error, message: error });
const path = (url: string) => new URL(url).pathname + new URL(url).search;
const emptyPull = () => json(200, { changes: [], cursor: '0', hasMore: false });
const isPush = (url: string, init: RequestInit) =>
  init.method === 'POST' && url.includes('/v1/sync');

function habitChange(id: string): SyncChange {
  return {
    entity: 'habit',
    entityId: id,
    updatedAt: NOW,
    deletedAt: null,
    payload: {
      id,
      updatedAt: NOW,
      deletedAt: null,
      key: null,
      name: `h-${id}`,
      description: '',
      type: 'boolean',
      target: 1,
      targetMax: null,
      active: true,
      order: 0,
      progressive: null,
    },
  };
}

async function enqueue(n: number, prefix = 'a') {
  for (let i = 0; i < n; i++) {
    const c = habitChange(`${prefix}${i}`);
    await db.outbox.add({ entity: c.entity, entityId: c.entityId, change: c });
  }
}

async function consent(registered = true) {
  await updateSettings({
    consent: { granted: true, version: 1, at: NOW },
    participant: { code: 'NEXO-ABCD', key: KEY, registered },
    consentSyncedVersion: registered ? 1 : undefined,
  });
}

beforeEach(async () => {
  await resetDbForTests();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  httpConfig.retryDelaysMs = [0, 0, 0, 0, 0];
  handler = (url, init) => {
    if (isPush(url, init)) return json(200, { applied: 0, cursor: '9' });
    if (url.includes('/v1/sync')) return emptyPull();
    return err(404, 'x');
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncNow', () => {
  it('sem consentimento retorna skipped e não chama fetch', async () => {
    await updateSettings({ participant: { code: 'NEXO-ABCD', key: KEY, registered: true } });
    expect(await syncNow()).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consentimento de versão antiga também é skipped', async () => {
    await updateSettings({
      consent: { granted: true, version: 0, at: NOW },
      participant: { code: 'NEXO-ABCD', key: KEY, registered: true },
    });
    expect(await syncNow()).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timeout depois de o servidor aplicar: reenvia o mesmo lote e esvazia o outbox', async () => {
    await consent();
    await enqueue(3);
    let pushes = 0;
    const bodies: string[] = [];
    handler = (url, init) => {
      if (isPush(url, init)) {
        pushes++;
        bodies.push(String(init.body));
        if (pushes === 1) throw new DOMException('timeout', 'AbortError');
        return json(200, { applied: 3, cursor: '5' });
      }
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(pushes).toBe(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(await outboxCount()).toBe(0);
  });

  it('503, 503, 200: sucesso com 3 chamadas de push', async () => {
    await consent();
    await enqueue(1);
    let pushes = 0;
    handler = (url, init) => {
      if (isPush(url, init)) {
        pushes++;
        return pushes < 3 ? err(503, 'unavailable') : json(200, { applied: 1, cursor: '1' });
      }
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(pushes).toBe(3);
    expect(await outboxCount()).toBe(0);
  });

  it('400 no push: sem retry, itens permanecem e o resultado é error', async () => {
    await consent();
    await enqueue(2);
    let pushes = 0;
    handler = (url, init) => {
      if (isPush(url, init)) {
        pushes++;
        return err(400, 'validation');
      }
      return emptyPull();
    };
    expect(await syncNow()).toBe('error');
    expect(pushes).toBe(1);
    expect(await outboxCount()).toBe(2);
  });

  it('envia em lotes de 500', async () => {
    await consent();
    await enqueue(501);
    const sizes: number[] = [];
    handler = (url, init) => {
      if (isPush(url, init)) {
        sizes.push((JSON.parse(String(init.body)) as { changes: unknown[] }).changes.length);
        return json(200, { applied: 1, cursor: '1' });
      }
      return emptyPull();
    };
    await syncNow();
    expect(sizes).toEqual([500, 1]);
    expect(await outboxCount()).toBe(0);
  });

  it('registro com 409 gera novo código, salva e repete', async () => {
    await consent(false);
    const codes: string[] = [];
    handler = (url, init) => {
      if (url.endsWith('/v1/participants')) {
        codes.push((JSON.parse(String(init.body)) as { code: string }).code);
        return codes.length === 1 ? err(409, 'code_taken') : json(201, { code: codes[1] });
      }
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(codes).toHaveLength(2);
    expect(codes[1]).not.toBe(codes[0]);
    expect((await getSettings()).participant).toEqual({
      code: codes[1],
      key: KEY,
      registered: true,
    });
  });

  it('PATCH do consentimento quando a versão conhecida pelo servidor é mais antiga', async () => {
    await consent();
    await updateSettings({ consentSyncedVersion: 0 });
    const calls: string[] = [];
    handler = (url, init) => {
      calls.push(`${init.method} ${path(url)}`);
      if (url.includes('/consent')) return json(200, { consentVersion: 1, consentAt: NOW });
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    await syncNow();
    expect(calls[0]).toBe('PATCH /v1/participants/me/consent');
    expect((await getSettings()).consentSyncedVersion).toBe(1);
  });

  it('pull em duas páginas, usando o cursor do GET e ignorando o do POST', async () => {
    await consent();
    await enqueue(1);
    const gets: string[] = [];
    handler = (url, init) => {
      if (init.method === 'POST') return json(200, { applied: 1, cursor: '999' });
      gets.push(path(url));
      if (url.includes('since=0')) {
        return json(200, { changes: [habitChange('r1')], cursor: '10', hasMore: true });
      }
      return json(200, { changes: [habitChange('r2')], cursor: '20', hasMore: false });
    };
    expect(await syncNow()).toBe('synced');
    expect(gets).toEqual(['/v1/sync?since=0', '/v1/sync?since=10']);
    expect((await getSettings()).syncCursor).toBe('20');
    expect(await db.habits.count()).toBe(2);
    expect(await outboxCount()).toBe(0);
    expect((await getSettings()).lastSyncAt).not.toBeNull();
  });

  it('chamadas simultâneas compartilham a mesma execução', async () => {
    await consent();
    const [a, b] = await Promise.all([syncNow(), syncNow()]);
    expect(a).toBe('synced');
    expect(b).toBe('synced');
    expect(fetchMock.mock.calls.filter(([, i]) => i.method === 'GET')).toHaveLength(1);
  });

  it('401 vira erro com mensagem de restauração e não apaga dados', async () => {
    await consent();
    await enqueue(1);
    handler = () => err(401, 'unauthorized');
    expect(await syncNow()).toBe('error');
    expect(await outboxCount()).toBe(1);
    expect((await getSettings()).participant?.key).toBe(KEY);
    expect(getSyncSnapshot().error).toBe('unauthorized');
  });

  it('offline: não chama fetch', async () => {
    await consent();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await syncNow()).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remove respostas de texto antes de enviar o questionário', async () => {
    await consent();
    const kind = questionnaireKind.options.find((k) =>
      getQuestionnaire(k).questions.some((q) => q.type === 'text'),
    );
    if (!kind) throw new Error('nenhum questionário com texto');
    const def = getQuestionnaire(kind);
    const text = def.questions.find((q) => q.type === 'text');
    const other = def.questions.find((q) => q.type !== 'text');
    if (!text || !other) throw new Error('questionário sem perguntas');
    const answers: Answers = { [text.id]: 'segredo', [other.id]: 1 };
    await saveQuestionnaireResponse({
      id: 'q1',
      kind,
      version: def.version,
      answers,
      score: null,
      submittedAt: NOW,
    });
    let sent: string | null = null;
    handler = (url, init) => {
      if (url.endsWith('/v1/questionnaires')) {
        sent = String(init.body);
        return json(201, { score: 0.5 });
      }
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    await syncNow();
    expect(sent).not.toBeNull();
    expect(sent).not.toContain('segredo');
    const row = await db.questionnaireResponses.get('q1');
    expect(row?.syncedAt).not.toBeNull();
    expect(row?.score).toBe(0.5);
  });

  it('questionário com 409 é marcado como sincronizado com flag de conflito', async () => {
    await consent();
    await saveQuestionnaireResponse({
      id: 'q2',
      kind: 'inicial',
      version: getQuestionnaire('inicial').version,
      answers: {},
      score: null,
      submittedAt: NOW,
    });
    handler = (url, init) => {
      if (url.endsWith('/v1/questionnaires')) return err(409, 'id_conflict');
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    await syncNow();
    const row = await db.questionnaireResponses.get('q2');
    expect(row?.syncedAt).not.toBeNull();
    expect(row?.syncConflict).toBe(true);
  });

  it('check-in: confirmado grava workshop e data; 410 vira expired; 404 vira invalid_code', async () => {
    await consent();
    const ok = await addCheckin('AAAAAA');
    const late = await addCheckin('BBBBBB');
    const bad = await addCheckin('CCCCCC');
    handler = (url, init) => {
      if (url.endsWith('/v1/checkins')) {
        const { sessionCode } = JSON.parse(String(init.body)) as { sessionCode: string };
        if (sessionCode === 'AAAAAA') {
          return json(201, { status: 'confirmed', workshop: 2, date: '2026-11-17' });
        }
        return sessionCode === 'BBBBBB' ? err(410, 'expired') : err(404, 'invalid_code');
      }
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    await syncNow();
    expect(await db.checkins.get(ok.id)).toMatchObject({
      status: 'confirmed',
      workshop: 2,
      date: '2026-11-17',
    });
    expect(await db.checkins.get(late.id)).toMatchObject({ status: 'rejected', reason: 'expired' });
    expect(await db.checkins.get(bad.id)).toMatchObject({
      status: 'rejected',
      reason: 'invalid_code',
    });
    expect((await db.checkins.get(ok.id))?.syncedAt).not.toBeNull();
  });
});

describe('revogar e apagar', () => {
  it('revokeConsent esvazia o outbox e o próximo syncNow é skipped', async () => {
    await consent();
    await enqueue(5);
    await revokeConsent();
    expect(await outboxCount()).toBe(0);
    expect((await getSettings()).consent).toBeNull();
    expect(await syncNow()).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deleteRemoteParticipant chama DELETE com credenciais e marca como não registrado', async () => {
    await consent();
    let headers: Record<string, string> = {};
    handler = (url, init) => {
      expect(init.method).toBe('DELETE');
      expect(path(url)).toBe('/v1/participants/me');
      headers = init.headers as Record<string, string>;
      return json(204);
    };
    await deleteRemoteParticipant();
    expect(headers['x-participant-code']).toBe('NEXO-ABCD');
    expect(headers['x-participant-key']).toBe(KEY);
    expect((await getSettings()).participant?.registered).toBe(false);
  });
});

describe('restoreFromServer', () => {
  it('valida via pull, popula tabelas, grava cursor e registered', async () => {
    handler = (url, init) => {
      expect(init.method).toBe('GET');
      const h = init.headers as Record<string, string>;
      expect(h['x-participant-code']).toBe('NEXO-WXYZ');
      if (url.includes('since=0')) {
        return json(200, { changes: [habitChange('r1')], cursor: '7', hasMore: true });
      }
      return json(200, { changes: [habitChange('r2')], cursor: '8', hasMore: false });
    };
    await restoreFromServer('nexo-wxyz', KEY.toLowerCase());
    expect(await db.habits.count()).toBe(2);
    const s = await getSettings();
    expect(s.participant).toEqual({ code: 'NEXO-WXYZ', key: KEY, registered: true });
    expect(s.syncCursor).toBe('8');
  });

  it('credenciais inválidas lançam erro e não alteram nada', async () => {
    handler = () => err(401, 'unauthorized');
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toMatchObject({ status: 401 });
    expect((await getSettings()).participant).toBeNull();
  });
});
