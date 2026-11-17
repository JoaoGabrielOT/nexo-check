import { toLocalDateKey, msUntilNextLocalMidnight, lastNDateKeys } from '../src/dates';

describe('datas locais', () => {
  test('toLocalDateKey usa o fuso local', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toLocalDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  test('msUntilNextLocalMidnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 0, 5, 23, 59, 0))).toBe(60000);
  });

  test('lastNDateKeys cruza mês e ano', () => {
    expect(lastNDateKeys('2026-03-01', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(lastNDateKeys('2026-01-02', 3)).toEqual(['2025-12-31', '2026-01-01', '2026-01-02']);
    expect(lastNDateKeys('2024-03-01', 2)).toEqual(['2024-02-29', '2024-03-01']);
  });

  test('lastNDateKeys com n=1 e n<=0', () => {
    expect(lastNDateKeys('2026-03-01', 1)).toEqual(['2026-03-01']);
    expect(lastNDateKeys('2026-03-01', 0)).toEqual([]);
  });
});
