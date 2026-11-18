/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultHabits, CONSENT_VERSION } from '@nexo/shared';
import type { Habit, SyncChange } from '@nexo/shared';
import { db, resetDbForTests } from '../../src/db/db';
import { setNowForTests } from '../../src/db/clock';
import { BackupError, exportAll, importAll, wipeLocal } from '../../src/db/backup';
import {
  applyRemoteChanges,
  deleteHabit,
  ensureDefaultHabits,
  getDailyLog,
  getEntriesBetween,
  getEntriesForDate,
  getHabits,
  getSettings,
  outboxCount,
  peekOutbox,
  ackOutbox,
  saveDailyLog,
  saveHabit,
  saveQuestionnaireResponse,
  getQuestionnaireResponses,
  markQuestionnaireSynced,
  addCheckin,
  DuplicateCheckinError,
  updateCheckinStatus,
  setEntry,
  updateSettings,
} from '../../src/db';
import { DEFAULT_REMINDERS } from '../../src/db/repos/settings';

let n = 0;
const habit = (over: Partial<Habit> = {}): Habit => ({
  ...createDefaultHabits(new Date('2026-01-01T00:00:00Z'), () => `h${++n}`)[0]!,
  ...over,
});

const consent = () =>
  updateSettings({
    consent: { granted: true, version: CONSENT_VERSION, at: '2026-01-01T00:00:00.000Z' },
  });

const log = (date: string, note: string | null = 'segredo') => ({
  id: date,
  date,
  stress: 3 as const,
  mood: 3 as const,
  energy: 3 as const,
  sleepQuality: 3 as const,
  note,
});

beforeEach(async () => {
  n = 0;
  setNowForTests(null);
  await resetDbForTests();
});

describe('settings', () => {
  it('devolve os padrões quando ausente e mescla o patch', async () => {
    expect(await getSettings()).toEqual({
      onboardingDone: false,
      consent: null,
      participant: null,
      theme: 'system',
      reminders: DEFAULT_REMINDERS,
      syncCursor: null,
      lastSyncAt: null,
      unlockedAchievements: [],
    });
    await updateSettings({ theme: 'dark' });
    expect((await getSettings()).theme).toBe('dark');
    expect((await getSettings()).onboardingDone).toBe(false);
  });
});

describe('outbox e consentimento', () => {
  it('sem consentimento não enfileira', async () => {
    await setEntry(habit(), '2026-01-02', 10);
    await saveDailyLog(log('2026-01-02'));
    expect(await outboxCount()).toBe(0);
  });

  it('consentimento de versão antiga ou recusado não enfileira', async () => {
    await updateSettings({
      consent: { granted: false, version: CONSENT_VERSION, at: '2026-01-01T00:00:00.000Z' },
    });
    await setEntry(habit(), '2026-01-02', 10);
    await updateSettings({
      consent: { granted: true, version: CONSENT_VERSION - 1, at: '2026-01-01T00:00:00.000Z' },
    });
    await setEntry(habit(), '2026-01-02', 10);
    expect(await outboxCount()).toBe(0);
  });

  it('com consentimento enfileira dailyLog com note null e mantém a nota local', async () => {
    await consent();
    await saveDailyLog(log('2026-01-02'));
    const items = await peekOutbox(10);
    expect(items).toHaveLength(1);
    const change = items[0]!.change;
    expect(change.entity).toBe('dailyLog');
    expect((change.payload as { note: string | null }).note).toBeNull();
    expect((await getDailyLog('2026-01-02'))?.note).toBe('segredo');
  });

  it('setEntry duas vezes no mesmo dia: 1 registro, 2 itens no outbox', async () => {
    await consent();
    const h = habit();
    await setEntry(h, '2026-01-02', 10);
    await setEntry(h, '2026-01-02', 20, [10, 10]);
    const entries = await getEntriesForDate('2026-01-02');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: `${h.id}:2026-01-02`, value: 20, blocks: [10, 10] });
    expect(await outboxCount()).toBe(2);
  });

  it('ackOutbox remove só os itens indicados', async () => {
    await consent();
    const h = habit();
    await setEntry(h, '2026-01-02', 1);
    await setEntry(h, '2026-01-03', 1);
    const [first] = await peekOutbox(1);
    await ackOutbox([first!.seq]);
    expect(await outboxCount()).toBe(1);
  });
});

describe('entries', () => {
  it('mudar a meta não reescreve o snapshot do dia', async () => {
    const h = habit({ target: 30 });
    await setEntry(h, '2026-01-02', 10);
    await setEntry({ ...h, target: 60 }, '2026-01-02', 40);
    const [e] = await getEntriesForDate('2026-01-02');
    expect(e).toMatchObject({ value: 40, targetSnapshot: 30 });
    await setEntry({ ...h, target: 60 }, '2026-01-03', 40);
    expect(
      (await getEntriesBetween('2026-01-02', '2026-01-03')).map((x) => x.targetSnapshot),
    ).toEqual([30, 60]);
  });

  it('atualiza updatedAt com o relógio injetado', async () => {
    setNowForTests(() => new Date('2026-02-01T10:00:00Z'));
    await setEntry(habit(), '2026-01-02', 1);
    expect((await getEntriesForDate('2026-01-02'))[0]!.updatedAt).toBe('2026-02-01T10:00:00.000Z');
  });
});

describe('habits', () => {
  it('deleteHabit é tombstone, some das leituras e enfileira', async () => {
    await consent();
    setNowForTests(() => new Date('2026-03-01T00:00:00Z'));
    const h = habit();
    await saveHabit(h);
    await deleteHabit(h.id);
    expect(await getHabits()).toHaveLength(0);
    const row = await db.habits.get(h.id);
    expect(row?.deletedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(row?.updatedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(await outboxCount()).toBe(2);
  });

  it('ensureDefaultHabits cria os 6 hábitos uma única vez', async () => {
    await ensureDefaultHabits(new Date('2026-01-01T00:00:00Z'));
    await ensureDefaultHabits(new Date('2026-01-01T00:00:00Z'));
    expect(await getHabits()).toHaveLength(6);
  });
});

describe('applyRemoteChanges', () => {
  const remoteEntry = (updatedAt: string, value: number): SyncChange => ({
    entity: 'habitEntry',
    entityId: 'h1:2026-01-02',
    updatedAt,
    deletedAt: null,
    payload: {
      id: 'h1:2026-01-02',
      updatedAt,
      deletedAt: null,
      habitId: 'h1',
      date: '2026-01-02',
      value,
      blocks: [],
      targetSnapshot: 30,
      targetMaxSnapshot: null,
    },
  });

  it('não sobrescreve com updatedAt mais antigo, aplica o mais novo e não enfileira', async () => {
    await consent();
    setNowForTests(() => new Date('2026-01-05T00:00:00Z'));
    await setEntry(habit({ id: 'h1' }), '2026-01-02', 10);
    const before = await outboxCount();
    await applyRemoteChanges([remoteEntry('2026-01-04T00:00:00.000Z', 99)]);
    expect((await getEntriesForDate('2026-01-02'))[0]!.value).toBe(10);
    await applyRemoteChanges([remoteEntry('2026-01-06T00:00:00.000Z', 99)]);
    expect((await getEntriesForDate('2026-01-02'))[0]!.value).toBe(99);
    expect(await outboxCount()).toBe(before);
  });

  it('dailyLog remoto com note null preserva a nota local', async () => {
    setNowForTests(() => new Date('2026-01-05T00:00:00Z'));
    await saveDailyLog(log('2026-01-02', 'minha nota'));
    await applyRemoteChanges([
      {
        entity: 'dailyLog',
        entityId: '2026-01-02',
        updatedAt: '2026-01-06T00:00:00.000Z',
        deletedAt: null,
        payload: {
          ...log('2026-01-02', null),
          stress: 5,
          updatedAt: '2026-01-06T00:00:00.000Z',
          deletedAt: null,
          note: null,
        },
      },
    ]);
    const l = await getDailyLog('2026-01-02');
    expect(l).toMatchObject({ stress: 5, note: 'minha nota' });
  });
});

describe('questionários e check-ins', () => {
  it('salva, filtra por kind e marca sincronizado', async () => {
    await saveQuestionnaireResponse({
      id: 'q1',
      kind: 'inicial',
      version: 1,
      answers: { a: 1 },
      score: null,
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await getQuestionnaireResponses('final')).toHaveLength(0);
    await markQuestionnaireSynced('q1', '2026-01-02T00:00:00.000Z');
    expect((await getQuestionnaireResponses('inicial'))[0]!.syncedAt).toBe(
      '2026-01-02T00:00:00.000Z',
    );
  });

  it('addCheckin cria pending e updateCheckinStatus aplica o patch', async () => {
    const c = await addCheckin('ABC');
    expect(c).toMatchObject({ status: 'pending', sessionCode: 'ABC' });
    await updateCheckinStatus(c.id, { status: 'confirmed', workshop: 1, date: '2026-01-02' });
    expect((await db.checkins.get(c.id))?.status).toBe('confirmed');
  });

  it('addCheckin recusa o mesmo código, inclusive em chamadas simultâneas', async () => {
    const results = await Promise.allSettled([addCheckin('XYZ234'), addCheckin('XYZ234')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(DuplicateCheckinError);
    expect(await db.checkins.count()).toBe(1);
  });
});

describe('backup', () => {
  const snapshot = async () => ({
    entries: await db.habitEntries.toArray(),
    settings: await db.settings.toArray(),
    outbox: await db.outbox.toArray(),
  });

  describe('importAll rejeita sem alterar nada', () => {
    const seed = async () => {
      await consent();
      await updateSettings({ syncCursor: 'cur-1' });
      await setEntry(habit(), '2026-01-02', 10);
      return snapshot();
    };
    const validBackup = async () => JSON.parse(JSON.stringify(await exportAll()));

    const cases: [string, () => Promise<unknown>][] = [
      ['app errado', async () => ({ app: 'outro' })],
      [
        'cabeçalho válido e habitEntries[0] inválido',
        async () => {
          const b = await validBackup();
          b.data.habitEntries[0].date = 'ontem';
          return b;
        },
      ],
      ['schemaVersion 2', async () => ({ ...(await validBackup()), schemaVersion: 2 })],
      ['null', async () => null],
      ['texto', async () => 'texto'],
      ['undefined', async () => undefined],
    ];

    it.each(cases)('%s', async (_name, build) => {
      const before = await seed();
      const input = await build();
      await expect(importAll(input)).rejects.toBeInstanceOf(BackupError);
      await expect(importAll(input)).rejects.toMatchObject({
        messageKey: 'errors.backup.invalid',
      });
      expect(await snapshot()).toEqual(before);
      expect(before.entries).toHaveLength(1);
      expect(before.outbox).toHaveLength(1);
    });

    it('falha no meio da transação desfaz tudo (rollback)', async () => {
      const before = await seed();
      const backup = await validBackup();
      await saveDailyLog(log('2026-01-05'));
      const withLog = await snapshot();
      const spy = vi.spyOn(db.dailyLogs, 'bulkPut').mockRejectedValueOnce(new Error('x'));
      await expect(importAll(backup)).rejects.toThrow();
      spy.mockRestore();
      expect(await snapshot()).toEqual(withLog);
      expect(withLog.entries).toEqual(before.entries);
      expect(await getDailyLog('2026-01-05')).toBeDefined();
    });
  });

  it('importAll(await exportAll()) restaura tudo após wipeLocal e limpa o outbox', async () => {
    await consent();
    await updateSettings({ participant: { code: 'NEXO-ABCD', key: 'k', registered: true } });
    await ensureDefaultHabits(new Date('2026-01-01T00:00:00Z'));
    const h = (await getHabits())[0]!;
    await setEntry(h, '2026-01-02', 10);
    await saveDailyLog(log('2026-01-02'));
    await saveQuestionnaireResponse({
      id: 'q1',
      kind: 'inicial',
      version: 1,
      answers: { a: 'x' },
      score: null,
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    const c = await addCheckin('ABC');
    const backup = await exportAll();
    await wipeLocal();
    expect(await db.habits.count()).toBe(0);
    expect(await outboxCount()).toBe(0);
    await importAll(JSON.parse(JSON.stringify(backup)));
    expect(await getHabits()).toHaveLength(6);
    expect(await getEntriesForDate('2026-01-02')).toHaveLength(1);
    expect((await getDailyLog('2026-01-02'))?.note).toBe('segredo');
    expect(await getQuestionnaireResponses()).toHaveLength(1);
    expect((await db.checkins.get(c.id))?.sessionCode).toBe('ABC');
    const s = await getSettings();
    expect(s.participant?.code).toBe('NEXO-ABCD');
    expect(s.consent?.granted).toBe(true);
  });

  it('com consentimento válido reenfileira cada linha sincronizável, sem notas, e zera o cursor', async () => {
    await consent();
    await updateSettings({ syncCursor: 'cur-1' });
    await ensureDefaultHabits(new Date('2026-01-01T00:00:00Z'));
    const h = (await getHabits())[0]!;
    await setEntry(h, '2026-01-02', 10);
    await saveDailyLog(log('2026-01-02'));
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await wipeLocal();
    await importAll(backup);
    const items = await peekOutbox(100);
    const count = (e: string) => items.filter((i) => i.change.entity === e).length;
    expect(items).toHaveLength(8);
    expect([count('habit'), count('habitEntry'), count('dailyLog')]).toEqual([6, 1, 1]);
    for (const i of items) {
      if (i.change.entity === 'dailyLog') expect(i.change.payload.note).toBeNull();
    }
    expect((await getSettings()).syncCursor).toBeNull();
    expect((await getDailyLog('2026-01-02'))?.note).toBe('segredo');
  });

  it('sem consentimento a importação deixa o outbox vazio e mantém o cursor', async () => {
    await updateSettings({ syncCursor: 'cur-1' });
    await ensureDefaultHabits(new Date('2026-01-01T00:00:00Z'));
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    await wipeLocal();
    await importAll(backup);
    expect(await outboxCount()).toBe(0);
    expect((await getSettings()).syncCursor).toBe('cur-1');
  });

  it('wipeLocal limpa settings e outbox', async () => {
    await consent();
    await setEntry(habit(), '2026-01-02', 1);
    await wipeLocal();
    expect(await outboxCount()).toBe(0);
    expect((await getSettings()).consent).toBeNull();
  });
});
