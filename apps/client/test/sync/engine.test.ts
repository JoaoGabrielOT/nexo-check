import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuestionnaire, questionnaireKind, type Answers, type SyncChange } from '@nexo/shared';
import { resetDbForTests } from '../../src/db/db';
import {
  addCheckin,
  db,
  backfillHistory,
  getSettings,
  outboxCount,
  saveQuestionnaireResponse,
  updateSettings,
} from '../../src/db';
import { httpConfig } from '../../src/sync/http';
import {
  deleteRemoteParticipant,
  getSyncSnapshot,
  RestoreBlockedError,
  RestoreNeedsConfirmError,
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
      // A sondagem com as credenciais atuais falha: o código pertence a outra pessoa.
      if (url.includes('since=999999999999999999')) return err(401, 'unauthorized');
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

  it('409 code_taken com credenciais que autenticam: marca registrado e mantém o código', async () => {
    await consent(false);
    let posts = 0;
    handler = (url, init) => {
      if (url.endsWith('/v1/participants')) {
        posts++;
        return err(409, 'code_taken');
      }
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(posts).toBe(1);
    expect((await getSettings()).participant).toEqual({
      code: 'NEXO-ABCD',
      key: KEY,
      registered: true,
    });
  });

  it('registro com 429 não repete a tentativa e termina em error', async () => {
    await consent(false);
    let posts = 0;
    handler = (url) => {
      if (url.endsWith('/v1/participants')) {
        posts++;
        return err(429, 'rate_limited');
      }
      return emptyPull();
    };
    expect(await syncNow()).toBe('error');
    expect(posts).toBe(1);
    expect(getSyncSnapshot().error).toBe('server');
    expect((await getSettings()).participant?.registered).toBe(false);
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

  it('401 sem o flag de backup restaurado não recadastra (exclusão feita em outro aparelho)', async () => {
    await consent();
    let posts = 0;
    handler = (url) => {
      if (url.endsWith('/v1/participants')) posts++;
      return err(401, 'unauthorized');
    };
    expect(await syncNow()).toBe('error');
    expect(posts).toBe(0);
    expect(getSyncSnapshot().error).toBe('unauthorized');
  });

  it('401 com o flag recadastra uma vez com o mesmo código e chave e refaz o histórico', async () => {
    await consent();
    await updateSettings({ restoredFromBackup: true });
    await updateSettings({ syncCursor: '77' });
    let accountExists = false;
    const posted: { code: string; key: string }[] = [];
    handler = (url, init) => {
      if (url.endsWith('/v1/participants')) {
        posted.push(JSON.parse(String(init.body)) as { code: string; key: string });
        accountExists = true;
        return json(201, { code: 'NEXO-ABCD' });
      }
      if (!accountExists) return err(401, 'unauthorized');
      if (isPush(url, init)) return json(200, { applied: 0, cursor: '9' });
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(posted).toEqual([expect.objectContaining({ code: 'NEXO-ABCD', key: KEY })]);
    const s = await getSettings();
    expect(s.participant).toEqual({ code: 'NEXO-ABCD', key: KEY, registered: true });
    expect(s.backfillPending).toBeFalsy();
    expect(s.restoredFromBackup).toBeFalsy();
  });

  it('401 e o recadastro dá code_taken: mantém o erro, limpa o flag e não tenta de novo', async () => {
    await consent();
    await updateSettings({ restoredFromBackup: true });
    let posts = 0;
    handler = (url) => {
      if (url.endsWith('/v1/participants')) {
        posts++;
        return err(409, 'code_taken');
      }
      return err(401, 'unauthorized');
    };
    expect(await syncNow()).toBe('error');
    expect(await syncNow()).toBe('error');
    expect(posts).toBe(1);
    expect((await getSettings()).restoredFromBackup).toBeFalsy();
    expect(getSyncSnapshot().error).toBe('unauthorized');
    expect((await getSettings()).participant?.registered).toBe(true);
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

describe('pull tolerante a mudanças desconhecidas', () => {
  it('ignora e registra a mudança de versão nova ou inválida, aplica as válidas e avança o cursor', async () => {
    await consent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    handler = (url, init) => {
      if (isPush(url, init)) return json(200, { applied: 0, cursor: '9' });
      return json(200, {
        changes: [
          habitChange('ok1'),
          { entity: 'futureThing', entityId: 'f1', payload: { x: 1 } },
          { ...habitChange('bad'), payload: { id: 'bad' } },
          habitChange('ok2'),
        ],
        cursor: '12',
        hasMore: false,
      });
    };
    expect(await syncNow()).toBe('synced');
    expect((await db.habits.toArray()).map((h) => h.id).sort()).toEqual(['ok1', 'ok2']);
    expect((await getSettings()).syncCursor).toBe('12');
    expect(warn).toHaveBeenCalledTimes(2);
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

  it('recusa quando há outro participante registrado com outbox pendente', async () => {
    await consent();
    await enqueue(1);
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toBeInstanceOf(RestoreBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getSettings()).participant?.code).toBe('NEXO-ABCD');
  });

  it('recusa com outro código local e questionário ainda não enviado, mesmo sem cadastro', async () => {
    await consent(false);
    await saveQuestionnaireResponse({
      id: 'q9',
      kind: 'inicial',
      version: getQuestionnaire('inicial').version,
      answers: {},
      score: null,
      submittedAt: NOW,
    });
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toBeInstanceOf(RestoreBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com registros locais de outra conta exige confirmação e não toca em nada', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toBeInstanceOf(
      RestoreNeedsConfirmError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.habitEntries.count()).toBe(1);
  });

  it('com outra conta cadastrada, mesmo sem dados, exige confirmação', async () => {
    await consent();
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toBeInstanceOf(
      RestoreNeedsConfirmError,
    );
  });

  it('hábito criado pela pessoa conta como dado local', async () => {
    await db.habits.add({ ...habitChange('mine').payload, key: null } as never);
    await updateSettings({ participant: { code: 'NEXO-ABCD', key: KEY, registered: false } });
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toBeInstanceOf(
      RestoreNeedsConfirmError,
    );
  });

  it('mesma conta com dados locais restaura sem confirmação', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    handler = () => json(200, { changes: [], cursor: '4', hasMore: false });
    await restoreFromServer('NEXO-ABCD', KEY);
    expect(await db.habitEntries.count()).toBe(1);
  });

  it('replaceLocal: apaga a conta atual no servidor, limpa o aparelho e restaura a nova', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    await db.habits.add({ ...habitChange('old').payload } as never);
    const calls: string[] = [];
    handler = (url, init) => {
      const h = init.headers as Record<string, string>;
      calls.push(`${init.method} ${path(url)} ${h['x-participant-code']}`);
      if (init.method === 'DELETE') return json(204);
      if (url.includes('since=999999999999999999')) return emptyPull();
      return json(200, { changes: [habitChange('r1')], cursor: '8', hasMore: false });
    };
    await restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true });
    expect(calls.some((c) => c === 'DELETE /v1/participants/me NEXO-ABCD')).toBe(true);
    expect(await db.habitEntries.count()).toBe(0);
    expect(await outboxCount()).toBe(0);
    expect((await db.habits.toArray()).map((h) => h.id)).toEqual(['r1']);
    expect((await getSettings()).participant).toEqual({
      code: 'NEXO-WXYZ',
      key: KEY,
      registered: true,
    });
  });

  it('replaceLocal com credenciais novas inválidas não apaga nada', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    handler = () => err(401, 'unauthorized');
    await expect(restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true })).rejects.toMatchObject(
      { status: 401 },
    );
    expect(await db.habitEntries.count()).toBe(1);
    expect((await getSettings()).participant?.code).toBe('NEXO-ABCD');
    expect(fetchMock.mock.calls.some(([, i]) => i.method === 'DELETE')).toBe(false);
  });

  it('replaceLocal segue em frente se a conta atual já não existe no servidor (401)', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    handler = (url, init) => {
      if (init.method === 'DELETE') return err(401, 'unauthorized');
      return json(200, { changes: [], cursor: '2', hasMore: false });
    };
    await restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true });
    expect(await db.habitEntries.count()).toBe(0);
    expect((await getSettings()).participant?.code).toBe('NEXO-WXYZ');
  });

  it('replaceLocal falha se a exclusão da conta atual falha e mantém os dados', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    httpConfig.retryDelaysMs = [];
    handler = (url, init) =>
      init.method === 'DELETE'
        ? err(503, 'unavailable')
        : json(200, { changes: [], cursor: '2', hasMore: false });
    await expect(restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true })).rejects.toMatchObject(
      { status: 503 },
    );
    expect(await db.habitEntries.count()).toBe(1);
  });

  it('só hábitos padrão e credenciais erradas (401): os hábitos continuam', async () => {
    await db.habits.add({ ...habitChange('default1').payload, key: 'movement' } as never);
    handler = () => err(401, 'unauthorized');
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toMatchObject({ status: 401 });
    expect(await db.habits.count()).toBe(1);
  });

  it('só hábitos padrão e falha de rede no primeiro GET: os hábitos continuam', async () => {
    await db.habits.add({ ...habitChange('default1').payload, key: 'movement' } as never);
    httpConfig.retryDelaysMs = [];
    handler = () => {
      throw new TypeError('network');
    };
    await expect(restoreFromServer('NEXO-WXYZ', KEY)).rejects.toMatchObject({ status: 0 });
    expect(await db.habits.count()).toBe(1);
  });

  it('replaceLocal: restaurou, o backfill pendente é limpo e o consentimento volta', async () => {
    await consent();
    await updateSettings({ backfillPending: true });
    await db.habitEntries.add({ id: 'e1' } as never);
    handler = (url, init) =>
      init.method === 'DELETE'
        ? json(204)
        : json(200, { changes: [habitChange('r1')], cursor: '8', hasMore: false });
    await restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true });
    const s = await getSettings();
    expect(s.backfillPending).toBeFalsy();
    expect(s.consent?.granted).toBe(true);
    expect(await outboxCount()).toBe(0);
  });

  it('replaceLocal: depois do DELETE, uma falha no pull deixa participante e consentimento nulos', async () => {
    await consent();
    await db.habitEntries.add({ id: 'e1' } as never);
    httpConfig.retryDelaysMs = [];
    let gets = 0;
    handler = (url, init) => {
      if (init.method === 'DELETE') return json(204);
      return ++gets === 1 ? emptyPull() : err(503, 'unavailable');
    };
    await expect(restoreFromServer('NEXO-WXYZ', KEY, { replaceLocal: true })).rejects.toMatchObject(
      { status: 503 },
    );
    const s = await getSettings();
    expect(s.participant).toBeNull();
    expect(s.consent).toBeNull();
    expect(await db.habitEntries.count()).toBe(0);
  });

  it('aparelho só com hábitos padrão: restaura sem duplicar os hábitos', async () => {
    await db.habits.add({ ...habitChange('default1').payload, key: 'movement' } as never);
    handler = () => json(200, { changes: [habitChange('r1')], cursor: '8', hasMore: false });
    await restoreFromServer('NEXO-WXYZ', KEY);
    expect((await db.habits.toArray()).map((h) => h.id)).toEqual(['r1']);
  });

  it('passa pela mesma trava do syncNow: só começa quando a sincronização termina', async () => {
    await consent();
    await enqueue(1);
    const order: string[] = [];
    let releasePush: () => void = () => undefined;
    const pushGate = new Promise<void>((r) => (releasePush = r));
    handler = async (url, init) => {
      if (isPush(url, init)) {
        order.push('push-start');
        await pushGate;
        order.push('push-end');
        return json(200, { applied: 1, cursor: '1' });
      }
      const h = init.headers as Record<string, string>;
      if (h['x-participant-code'] === 'NEXO-ABCD') return emptyPull();
      order.push('restore-get');
      return json(200, { changes: [], cursor: '4', hasMore: false });
    };
    const sync = syncNow();
    await vi.waitFor(() => expect(order).toContain('push-start'));
    // Mesmo participante: não é bloqueado pelo outbox, mas espera a trava.
    const restore = restoreFromServer('NEXO-ABCD', KEY);
    await new Promise((r) => setTimeout(r, 30));
    expect(order).not.toContain('restore-get');
    releasePush();
    await Promise.all([sync, restore]);
    expect(order.indexOf('push-end')).toBeLessThan(
      order.indexOf('restore-get') === -1 ? 99 : order.indexOf('restore-get'),
    );
  });
});

describe('revogação durante a sincronização', () => {
  it('revogar na espera do retry cancela: nenhum segundo POST e retorna rápido', async () => {
    await consent();
    await enqueue(2);
    httpConfig.retryDelaysMs = [400, 400];
    let pushes = 0;
    handler = (url, init) => {
      if (isPush(url, init)) {
        pushes++;
        return err(503, 'unavailable');
      }
      return emptyPull();
    };
    const sync = syncNow();
    await vi.waitFor(() => expect(pushes).toBe(1));
    const started = Date.now();
    await revokeConsent();
    expect(Date.now() - started).toBeLessThan(200);
    expect(await sync).toBe('skipped');
    await new Promise((r) => setTimeout(r, 500));
    expect(pushes).toBe(1);
    expect(await outboxCount()).toBe(0);
  });

  it('revokeConsent com deleteRemote apaga no servidor depois de revogar', async () => {
    await consent();
    handler = (url, init) => {
      expect(init.method).toBe('DELETE');
      return json(204);
    };
    await revokeConsent({ deleteRemote: true });
    const s = await getSettings();
    expect(s.consent).toBeNull();
    expect(s.participant?.registered).toBe(false);
  });
});

describe('check-in com erros sem código de negócio', () => {
  it.each([
    [404, 'http_404'],
    [404, 'expired'],
    [410, 'invalid_code'],
    [410, 'http_410'],
  ])('%i com code %s mantém o check-in pendente', async (status, code) => {
    await consent();
    const c = await addCheckin('AAAAAA');
    handler = (url, init) => {
      if (url.endsWith('/v1/checkins')) return err(status, code);
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    await syncNow();
    expect(await db.checkins.get(c.id)).toMatchObject({ status: 'pending', syncedAt: null });
  });
});

describe('questionário com erro de validação', () => {
  it('400 marca como tratado com conflito e não deixa a sincronização em erro', async () => {
    await consent();
    await saveQuestionnaireResponse({
      id: 'q3',
      kind: 'inicial',
      version: getQuestionnaire('inicial').version,
      answers: {},
      score: null,
      submittedAt: NOW,
    });
    handler = (url, init) => {
      if (url.endsWith('/v1/questionnaires')) return err(400, 'validation');
      if (init.method === 'POST') return json(200, { applied: 0, cursor: '0' });
      return emptyPull();
    };
    expect(await syncNow()).toBe('synced');
    expect(await db.questionnaireResponses.get('q3')).toMatchObject({ syncConflict: true });
    expect((await db.questionnaireResponses.get('q3'))?.syncedAt).not.toBeNull();
  });
});

describe('reenvio do histórico (backfill)', () => {
  async function seedHistory() {
    await db.habits.put(habitChange('h1').payload as never);
    await db.questionnaireResponses.put({
      id: 'qa',
      kind: 'inicial',
      version: getQuestionnaire('inicial').version,
      answers: {},
      score: null,
      submittedAt: NOW,
      syncedAt: NOW,
    });
    const c = await addCheckin('AAAAAA');
    await db.checkins.update(c.id, {
      status: 'confirmed',
      workshop: 1,
      date: '2026-11-17',
      syncedAt: NOW,
    });
    return c.id;
  }

  function recordingHandler() {
    const seen: string[] = [];
    handler = (url, init) => {
      seen.push(`${init.method} ${path(url)}`);
      if (url.endsWith('/v1/participants')) return json(201, { code: 'NEXO-ABCD' });
      if (url.endsWith('/v1/questionnaires')) return json(201, { score: null });
      if (url.endsWith('/v1/checkins')) {
        return json(200, { status: 'confirmed', workshop: 1, date: '2026-11-17' });
      }
      if (init.method === 'POST') return json(200, { applied: 1, cursor: '1' });
      return emptyPull();
    };
    return seen;
  }

  it('consentimento revogado durante o backfill: não enfileira nada e mantém o flag', async () => {
    await consent();
    await seedHistory();
    await updateSettings({ consent: null, backfillPending: true, syncCursor: '50' });
    await backfillHistory();
    expect(await outboxCount()).toBe(0);
    const s = await getSettings();
    expect(s.backfillPending).toBe(true);
    expect(s.syncCursor).toBe('50');
  });

  it('reconsentir depois de revogar reenvia tudo e zera o cursor', async () => {
    await consent();
    await updateSettings({ syncCursor: '50' });
    const checkinId = await seedHistory();
    await revokeConsent();
    await updateSettings({ consent: { granted: true, version: 1, at: NOW } });
    const seen = recordingHandler();
    expect(await syncNow()).toBe('synced');
    expect(seen).toContain('POST /v1/sync');
    expect(seen).toContain('GET /v1/sync?since=0');
    expect(seen).toContain('POST /v1/questionnaires');
    expect(seen).toContain('POST /v1/checkins');
    expect((await db.checkins.get(checkinId))?.status).toBe('confirmed');
    expect((await getSettings()).backfillPending).toBe(false);
  });

  it('apagar no servidor e sincronizar de novo registra e reenvia o histórico', async () => {
    await consent();
    await seedHistory();
    handler = () => json(204, null);
    await deleteRemoteParticipant();
    expect((await getSettings()).participant?.registered).toBe(false);
    const seen = recordingHandler();
    expect(await syncNow()).toBe('synced');
    expect(seen[0]).toBe('POST /v1/participants');
    expect(seen).toContain('POST /v1/sync');
    expect(seen).toContain('POST /v1/questionnaires');
    expect(seen).toContain('POST /v1/checkins');
  });
});
