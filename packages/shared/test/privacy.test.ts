import { stripPrivateFields } from '../src/privacy';
import type { DailyLog, Habit } from '../src/types';

const log: DailyLog = {
  id: '2026-03-01',
  updatedAt: '2026-03-01T10:00:00.000Z',
  deletedAt: null,
  date: '2026-03-01',
  stress: 3,
  mood: 3,
  energy: 3,
  sleepQuality: 3,
  note: 'triste',
};

describe('stripPrivateFields', () => {
  test('dailyLog.note vira null sem mutar a entrada', () => {
    const out = stripPrivateFields('dailyLog', log);
    expect(out.note).toBeNull();
    expect(log.note).toBe('triste');
    expect(out).not.toBe(log);
  });
  test('demais entidades passam como cópia', () => {
    const habit = { id: 'h', name: 'x' } as Habit;
    const out = stripPrivateFields('habit', habit);
    expect(out).toEqual(habit);
    expect(out).not.toBe(habit);
  });
});
