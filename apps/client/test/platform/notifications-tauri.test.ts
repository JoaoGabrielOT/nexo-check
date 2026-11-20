import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setNowForTests } from '../../src/db/clock';
import { DEFAULT_REMINDERS } from '../../src/db';
import i18n from '../../src/i18n';

interface Sent {
  id?: number;
  title: string;
  body?: string;
  channelId?: string;
  schedule?: unknown;
}

const plugin = vi.hoisted(() => {
  const state = { permission: true, scheduled: [] as { id: number }[] };
  return {
    state,
    isPermissionGranted: vi.fn(async () => state.permission),
    requestPermission: vi.fn(async () => (state.permission ? 'granted' : 'denied')),
    sendNotification: vi.fn((o: { id?: number }) => {
      if (o.id !== undefined) {
        state.scheduled = state.scheduled.filter((s) => s.id !== o.id);
        state.scheduled.push({ id: o.id });
      }
    }),
    pending: vi.fn(async () => state.scheduled.map((s) => ({ ...s }))),
    cancel: vi.fn(async (ids: number[]) => {
      state.scheduled = state.scheduled.filter((s) => !ids.includes(s.id));
    }),
    createChannel: vi.fn(async () => undefined),
  };
});

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: plugin.isPermissionGranted,
  requestPermission: plugin.requestPermission,
  sendNotification: plugin.sendNotification,
  pending: plugin.pending,
  cancel: plugin.cancel,
  createChannel: plugin.createChannel,
  Importance: { Default: 3 },
  Schedule: {
    interval: (interval: unknown, allowWhileIdle?: boolean) => ({ interval, allowWhileIdle }),
  },
}));

import { Schedule } from '@tauri-apps/plugin-notification';
import {
  REMINDER_ID_BASE,
  androidNotifications,
  desktopNotifications,
  reminderSlots,
} from '../../src/platform/notifications-tauri';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m, 0, 0);

beforeEach(() => {
  plugin.state.permission = true;
  plugin.state.scheduled = [];
  vi.clearAllMocks();
});

describe('reminderSlots', () => {
  it('movimento 08:00 ligado gera um slot com o id base', () => {
    const rules = { ...DEFAULT_REMINDERS, movement: { enabled: true, time: '08:00' } };
    expect(reminderSlots(rules)).toEqual([{ id: 1000, kind: 'movement', hour: 8, minute: 0 }]);
  });

  it('água a cada 120 min de 08:00 a 12:00 gera 3 slots com ids sequenciais', () => {
    const rules = {
      ...DEFAULT_REMINDERS,
      water: { enabled: true, everyMinutes: 120, from: '08:00', to: '12:00' },
    };
    expect(reminderSlots(rules)).toEqual([
      { id: 3000, kind: 'water', hour: 8, minute: 0 },
      { id: 3001, kind: 'water', hour: 10, minute: 0 },
      { id: 3002, kind: 'water', hour: 12, minute: 0 },
    ]);
  });

  it('intervalo abaixo de 30 min é limitado a 30', () => {
    const rules = {
      ...DEFAULT_REMINDERS,
      water: { enabled: true, everyMinutes: 10, from: '08:00', to: '09:00' },
    };
    expect(reminderSlots(rules).map((s) => [s.hour, s.minute])).toEqual([
      [8, 0],
      [8, 30],
      [9, 0],
    ]);
  });

  it('horário inválido ou lembrete desligado não gera slot', () => {
    expect(reminderSlots(DEFAULT_REMINDERS)).toEqual([]);
    expect(
      reminderSlots({
        ...DEFAULT_REMINDERS,
        movement: { enabled: true, time: '25:00' },
        water: { enabled: true, everyMinutes: Number.NaN, from: '08:00', to: '12:00' },
        activeBreak: { enabled: true, everyMinutes: 60, from: 'xx', to: '12:00' },
      }),
    ).toEqual([]);
  });
});

describe('androidNotifications', () => {
  const rules = {
    ...DEFAULT_REMINDERS,
    movement: { enabled: true, time: '08:00' },
    water: { enabled: true, everyMinutes: 120, from: '08:00', to: '10:00' },
  };

  it('é persistente (o agendamento sobrevive ao app fechado)', () => {
    expect(androidNotifications.persistent).toBe(true);
  });

  it('agenda uma notificação por slot, repetida todo dia, no canal reminders', async () => {
    await androidNotifications.schedule(rules);
    expect(plugin.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'reminders' }));
    const sent = plugin.sendNotification.mock.calls.map((c) => c[0] as unknown as Sent);
    expect(sent.map((s) => s.id)).toEqual([1000, 3000, 3001]);
    expect(sent[0]).toMatchObject({
      id: 1000,
      title: i18n.t('reminders.notifications.title'),
      body: i18n.t('reminders.notifications.movement'),
      channelId: 'reminders',
      schedule: Schedule.interval({ hour: 8, minute: 0 }, true),
    });
    expect(sent[2]).toMatchObject({
      body: i18n.t('reminders.notifications.water'),
      schedule: Schedule.interval({ hour: 10, minute: 0 }, true),
    });
  });

  it('chamar duas vezes com as mesmas regras não duplica', async () => {
    await androidNotifications.schedule(rules);
    await androidNotifications.schedule(rules);
    expect(plugin.state.scheduled.map((s) => s.id).sort()).toEqual([1000, 3000, 3001]);
  });

  it('chamadas simultâneas (StrictMode) também não duplicam', async () => {
    await Promise.all([androidNotifications.schedule(rules), androidNotifications.schedule(rules)]);
    expect(plugin.state.scheduled.map((s) => s.id).sort()).toEqual([1000, 3000, 3001]);
  });

  it('cancela só os ids das faixas dos lembretes (e remove os que saíram da configuração)', async () => {
    plugin.state.scheduled = [{ id: 1000 }, { id: 3005 }, { id: 5 }, { id: 9999 }];
    await androidNotifications.schedule(DEFAULT_REMINDERS);
    expect(plugin.cancel).toHaveBeenCalledWith([1000, 3005]);
    expect(plugin.state.scheduled.map((s) => s.id)).toEqual([5, 9999]);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it('sem permissão não agenda nada', async () => {
    plugin.state.permission = false;
    await androidNotifications.schedule(rules);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it('cancelAll cancela as faixas dos lembretes', async () => {
    await androidNotifications.schedule(rules);
    await androidNotifications.cancelAll();
    expect(plugin.state.scheduled).toEqual([]);
  });

  it('getPermission e requestPermission seguem o plugin', async () => {
    expect(await androidNotifications.getPermission()).toBe('granted');
    plugin.state.permission = false;
    expect(await androidNotifications.requestPermission()).toBe(false);
  });
});

describe('desktopNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNowForTests(() => at(7, 0));
  });
  afterEach(async () => {
    await desktopNotifications.cancelAll();
    vi.useRealTimers();
    setNowForTests(null);
  });

  it('não é persistente (os timers morrem com o app)', () => {
    expect(desktopNotifications.persistent).toBe(false);
  });

  it('dispara a notificação nativa na hora e rearma para o dia seguinte', async () => {
    await desktopNotifications.schedule({
      ...DEFAULT_REMINDERS,
      movement: { enabled: true, time: '08:00' },
    });
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    setNowForTests(() => at(8, 0));
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(plugin.sendNotification).toHaveBeenCalledTimes(1);
    expect(plugin.sendNotification).toHaveBeenCalledWith({
      title: i18n.t('reminders.notifications.title'),
      body: i18n.t('reminders.notifications.movement'),
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('sem permissão não notifica, mas mantém a cadeia', async () => {
    plugin.state.permission = false;
    await desktopNotifications.schedule({
      ...DEFAULT_REMINDERS,
      movement: { enabled: true, time: '08:00' },
    });
    setNowForTests(() => at(8, 0));
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('REMINDER_ID_BASE', () => {
  it('fixa as faixas de id', () => {
    expect(REMINDER_ID_BASE).toEqual({
      movement: 1000,
      activeBreak: 2000,
      water: 3000,
      bedtime: 4000,
    });
  });
});
