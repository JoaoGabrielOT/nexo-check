import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setNowForTests } from '../../src/db/clock';
import { DEFAULT_REMINDERS } from '../../src/db';
import {
  nextFixedTime,
  nextIntervalTime,
  webNotifications,
} from '../../src/platform/notifications';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  setNowForTests(() => at(7, 0));
});
afterEach(() => {
  webNotifications.cancelAll();
  vi.useRealTimers();
  setNowForTests(null);
});

describe('webNotifications.schedule', () => {
  it('movimento 08:00 agenda 1 timer para o próximo 08:00', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    webNotifications.schedule({
      ...DEFAULT_REMINDERS,
      movement: { enabled: true, time: '08:00' },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe(60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('dispara a notificação na hora e agenda o dia seguinte; cancelAll limpa os timers', () => {
    const shown = vi.fn();
    vi.stubGlobal('Notification', Object.assign(shown, { permission: 'granted' }));
    webNotifications.schedule({ ...DEFAULT_REMINDERS, movement: { enabled: true, time: '08:00' } });
    setNowForTests(() => at(8, 0));
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(shown).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    webNotifications.cancelAll();
    expect(vi.getTimerCount()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('Notification que lança não quebra a cadeia: o timer do lembrete é reagendado', () => {
    vi.stubGlobal(
      'Notification',
      Object.assign(
        vi.fn(() => {
          throw new TypeError('Illegal constructor');
        }),
        { permission: 'granted' },
      ),
    );
    webNotifications.schedule({ ...DEFAULT_REMINDERS, movement: { enabled: true, time: '08:00' } });
    setNowForTests(() => at(8, 0));
    expect(() => vi.advanceTimersByTime(60 * 60 * 1000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(1);
    setNowForTests(() => new Date(2026, 10, 19, 8, 0));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(1);
    vi.unstubAllGlobals();
  });

  it('intervalo fora de 30-240 é limitado ao agendar', () => {
    const rule = { everyMinutes: 1, from: '08:00', to: '18:00' };
    expect(nextIntervalTime(rule, at(8, 5))).toEqual(at(8, 30));
  });

  it('horários inválidos não agendam timer', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    webNotifications.schedule({
      movement: { enabled: true, time: '25:99' },
      activeBreak: { enabled: true, everyMinutes: 60, from: 'xx', to: '18:00' },
      water: { enabled: true, everyMinutes: Number.NaN, from: '08:00', to: '7:5' },
      bedtime: { enabled: true, time: '' },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lembretes desligados não agendam nada', () => {
    webNotifications.schedule(DEFAULT_REMINDERS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reagendar substitui os timers anteriores', () => {
    const rules = { ...DEFAULT_REMINDERS, bedtime: { enabled: true, time: '22:30' } };
    webNotifications.schedule(rules);
    webNotifications.schedule(rules);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('próximo horário', () => {
  it('horário fixo que já passou vai para amanhã', () => {
    expect(nextFixedTime('06:00', at(7))).toEqual(new Date(2026, 10, 19, 6, 0));
    expect(nextFixedTime('08:00', at(7))).toEqual(at(8));
  });

  it('intervalo respeita a janela e vira para o início do dia seguinte', () => {
    const rule = { everyMinutes: 60, from: '08:00', to: '10:00' };
    expect(nextIntervalTime(rule, at(7))).toEqual(at(8));
    expect(nextIntervalTime(rule, at(8, 30))).toEqual(at(9));
    expect(nextIntervalTime(rule, at(10, 0))).toEqual(new Date(2026, 10, 19, 8, 0));
  });
});

describe('requestPermission', () => {
  it('sem suporte a Notification devolve false', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await webNotifications.requestPermission()).toBe(false);
    vi.unstubAllGlobals();
  });
});
