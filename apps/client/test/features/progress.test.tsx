/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressPage } from '../../src/features/progress';
import { Heatmap, heatLevel } from '../../src/features/progress/Heatmap';
import { useProgressData } from '../../src/features/progress/useProgressData';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import { ensureDefaultHabits, getHabits, getSettings, saveDailyLog, setEntry } from '../../src/db';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@nexo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nexo/ui')>()),
  toast: toastMock,
}));

/** Cumpre os `n` primeiros hábitos no dia. */
async function fillDay(date: string, n: number) {
  const habits = await getHabits();
  for (const h of habits.slice(0, n)) await setEntry(h, date, h.target, [h.target]);
}

beforeEach(async () => {
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  toastMock.mockClear();
  setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
});

afterEach(() => setNowForTests(null));

describe('useProgressData', () => {
  it('semana: 7 itens em ordem, minutos do movimento e estresse do registro', async () => {
    const [movement, mobility] = await getHabits();
    await setEntry(movement!, '2026-11-12', 30, [10, 20]);
    await setEntry(movement!, '2026-11-17', 15, [15]);
    await setEntry(mobility!, '2026-11-17', 10, [10]); // outro hábito não soma
    await saveDailyLog({
      id: '2026-11-12',
      date: '2026-11-12',
      stress: 4,
      mood: 3,
      energy: 3,
      sleepQuality: 3,
      note: null,
    });

    const { result } = renderHook(() => useProgressData('week'));
    await waitFor(() => expect(result.current.days).toHaveLength(7));
    const { days } = result.current;
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ]);
    expect(days[1]).toMatchObject({ movementMinutes: 30, stress: 4 });
    expect(days[6]).toMatchObject({ movementMinutes: 15, stress: null });
    expect(days[0]).toMatchObject({ movementMinutes: 0, ratio: 0 });
  });

  it('mês: do dia 1 até hoje', async () => {
    const { result } = renderHook(() => useProgressData('month'));
    await waitFor(() => expect(result.current.days).toHaveLength(17));
    expect(result.current.days[0]?.date).toBe('2026-11-01');
    expect(result.current.days[16]?.date).toBe('2026-11-17');
  });
});

describe('Heatmap', () => {
  it('níveis por ratio', () => {
    expect([0, 0.2, 0.5, 0.99, 1].map(heatLevel)).toEqual([0, 1, 2, 2, 3]);
  });

  it('grade do mês com aria-label em porcentagem (piso) e dias futuros vazios', () => {
    render(
      <Heatmap
        today="2026-11-17"
        days={[
          { date: '2026-11-16', ratio: 1 / 3 },
          { date: '2026-11-17', ratio: 1 },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: '16/11: 33% do checklist' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '17/11: 100% do checklist' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^18\/11/ })).toBeNull();
  });
});

describe('Progresso', () => {
  it('mostra o streak e a tabela acessível do gráfico', async () => {
    for (const d of ['15', '16', '17']) await fillDay(`2026-11-${d}`, 3);
    render(<ProgressPage />);
    expect((await screen.findAllByText('3 dias')).length).toBeGreaterThan(0);
    const table = screen.getByRole('table', {
      name: 'Minutos de movimento e estresse percebido por dia',
    });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(8));
  });

  it('conquista streak_3 é gravada uma única vez, com um aviso', async () => {
    for (const d of ['15', '16', '17']) await fillDay(`2026-11-${d}`, 3);
    const first = render(<ProgressPage />);
    // espera a tela refletir a gravação antes de desmontar (evita atualização fora do act)
    expect(await screen.findByText(/Desbloqueada em/)).toBeInTheDocument();
    first.unmount();
    render(<ProgressPage />);
    expect(await screen.findByText(/Desbloqueada em/)).toBeInTheDocument();
    await screen.findAllByText('3 dias');

    const unlocked = (await getSettings()).unlockedAchievements;
    expect(unlocked.filter((a) => a.id === 'streak_3')).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('mantém as conquistas bloqueadas visíveis com a descrição', async () => {
    render(<ProgressPage />);
    expect(
      await screen.findByText('Sete dias consecutivos com todos os hábitos concluídos.'),
    ).toBeInTheDocument();
  });
});
