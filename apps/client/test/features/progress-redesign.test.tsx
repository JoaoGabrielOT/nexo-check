/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressPage } from '../../src/features/progress';
import { Heatmap } from '../../src/features/progress/Heatmap';
import { setNowForTests } from '../../src/db/clock';
import { db, resetDbForTests } from '../../src/db/db';
import { ensureDefaultHabits, getHabits, setEntry } from '../../src/db';

vi.mock('@nexo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nexo/ui')>()),
  toast: vi.fn(),
}));

beforeEach(async () => {
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
});

afterEach(() => setNowForTests(null));

describe('Progresso redesenhado', () => {
  it('destaca os dias de movimento do mês corrente (só valor > 0)', async () => {
    const movement = (await getHabits()).find((h) => h.key === 'movement')!;
    await setEntry(movement, '2026-10-31', 30, [30]); // mês anterior: não conta
    await setEntry(movement, '2026-11-02', 10, [10]);
    await setEntry(movement, '2026-11-09', 25, [10, 15]);
    await setEntry(movement, '2026-11-12', 0, []); // entrada zerada: não conta
    await setEntry(movement, '2026-11-17', 5, [5]);
    // Entrada apagada (tombstone) com minutos: não conta.
    await setEntry(movement, '2026-11-05', 20, [20]);
    await db.habitEntries.update(`${movement.id}:2026-11-05`, {
      deletedAt: '2026-11-06T10:00:00.000Z',
    });

    render(<ProgressPage />);
    const hero = await screen.findByRole('region', { name: 'Movimento no mês' });
    expect(await within(hero).findByText('3')).toBeInTheDocument();
    expect(within(hero).getByText('dias de movimento este mês')).toBeInTheDocument();
  });

  it('sequência atual e melhor sequência em blocos próprios', async () => {
    render(<ProgressPage />);
    const current = await screen.findByRole('region', { name: 'Sequência atual' });
    const best = screen.getByRole('region', { name: 'Melhor sequência' });
    expect(within(current).getByText('0 dias')).toBeInTheDocument();
    expect(within(best).getByText('0 dias')).toBeInTheDocument();
  });

  it('conquistas viram selos com título; bloqueadas dizem que ainda não foram desbloqueadas', async () => {
    render(<ProgressPage />);
    const list = await screen.findByRole('list', { name: 'Conquistas' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(within(items[0]!).getByText('Ainda não desbloqueada')).toBeInTheDocument();
  });
});

describe('Heatmap redesenhado', () => {
  const days = [
    { date: '2026-11-15', ratio: 0 },
    { date: '2026-11-16', ratio: 0.4 },
    { date: '2026-11-17', ratio: 1 },
  ];

  it('tem legenda em texto para os quatro níveis', () => {
    render(<Heatmap today="2026-11-17" days={days} />);
    const legend = screen.getByRole('list', { name: 'Legenda do mapa de calor' });
    for (const text of ['Nenhum', 'Menos da metade', 'Metade ou mais', 'Completo']) {
      expect(within(legend).getByText(text)).toBeInTheDocument();
    }
  });

  it('dia vazio usa contorno lavanda, nunca vermelho, e células arredondadas', () => {
    render(<Heatmap today="2026-11-17" days={days} />);
    const empty = [
      screen.getByRole('img', { name: '15/11: 0% do checklist' }),
      screen.getByRole('img', { name: '01/11: 0% do checklist' }),
    ];
    for (const cell of empty) {
      expect(cell.className).not.toMatch(/\b(?:[a-z]+:)?(?:bg|border|text|ring)-(?:rd|red)/);
      expect(cell.className).toMatch(/\bborder-lav\b/);
      expect(cell).toHaveClass('rounded-lg');
    }
  });
});
