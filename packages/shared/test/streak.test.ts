import { computeStreak } from '../src/streak';

describe('computeStreak', () => {
  test('dias abaixo do limite quebram a sequência', () => {
    const r = {
      '2026-03-01': 1,
      '2026-03-02': 0.5,
      '2026-03-03': 0.4,
      '2026-03-04': 1,
      '2026-03-05': 1,
    };
    expect(computeStreak(r, '2026-03-05')).toEqual({ current: 2, best: 2 });
  });

  test('hoje ainda inválido não zera: conta até ontem', () => {
    const r = { '2026-03-01': 1, '2026-03-02': 1, '2026-03-03': 1, '2026-03-04': 0 };
    expect(computeStreak(r, '2026-03-04')).toEqual({ current: 3, best: 3 });
  });

  test('data ausente quebra a sequência', () => {
    const r = { '2026-03-01': 1, '2026-03-03': 1, '2026-03-04': 1 };
    expect(computeStreak(r, '2026-03-04')).toEqual({ current: 2, best: 2 });
  });

  test('vazio', () => {
    expect(computeStreak({}, '2026-03-04')).toEqual({ current: 0, best: 0 });
  });

  test('melhor sequência pode estar no passado', () => {
    const r = { '2026-03-01': 1, '2026-03-02': 1, '2026-03-03': 1, '2026-03-05': 1 };
    expect(computeStreak(r, '2026-03-05')).toEqual({ current: 1, best: 3 });
  });

  test('atravessa a virada de ano', () => {
    const r = { '2025-12-30': 1, '2025-12-31': 1, '2026-01-01': 1, '2026-01-02': 1 };
    expect(computeStreak(r, '2026-01-02')).toEqual({ current: 4, best: 4 });
  });

  test('atravessa 28/29 de fevereiro em ano bissexto', () => {
    const r = { '2028-02-28': 1, '2028-02-29': 1, '2028-03-01': 1 };
    expect(computeStreak(r, '2028-03-01')).toEqual({ current: 3, best: 3 });
  });

  test('datas futuras não entram no best', () => {
    const r = { '2026-03-01': 1, '2026-03-05': 1, '2026-03-06': 1, '2026-03-07': 1 };
    expect(computeStreak(r, '2026-03-02')).toEqual({ current: 1, best: 1 });
  });
});
