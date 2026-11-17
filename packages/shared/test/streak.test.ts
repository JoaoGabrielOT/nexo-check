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
});
