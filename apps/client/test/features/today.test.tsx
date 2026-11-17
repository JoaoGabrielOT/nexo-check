/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from '../../src/features/today';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import {
  ensureDefaultHabits,
  getEntriesForDate,
  getHabits,
  saveHabit,
  setEntry,
  updateSettings,
} from '../../src/db';

const progress = () => screen.findByRole('progressbar', { name: 'Progresso do dia' });

beforeEach(async () => {
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  await updateSettings({ onboardingDone: true });
});

afterEach(() => {
  vi.useRealTimers();
  setNowForTests(null);
});

describe('Hoje', () => {
  it('lista os hábitos, o aviso fixo e a linha do movimento', async () => {
    render(<TodayPage />);
    expect(await progress()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0 de 6 hábitos')).toBeInTheDocument();
    expect(
      screen.getByText('Leve a moderado, no seu ritmo. Pode ser dividido em blocos.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Respeite seus limites. O app não substitui acompanhamento profissional.'),
    ).toBeInTheDocument();
  });

  it('respiração + 6 pausas ativas = 2/6 (33%)', async () => {
    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(
      await screen.findByRole('checkbox', { name: 'Marcar Respiração de recuperação como feita' }),
    );
    const plus = screen.getByRole('button', { name: 'Aumentar Pausas ativas' });
    for (let i = 0; i < 6; i++) await user.click(plus);
    await waitFor(async () => expect(await progress()).toHaveAttribute('aria-valuenow', '33'));
    expect(screen.getByText('2 de 6 hábitos')).toBeInTheDocument();
  });

  it('minutos: blocos somam, chips removem e contador não passa de 0', async () => {
    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Adicionar 10 minutos a Movimento do dia' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Adicionar 5 minutos a Movimento do dia' }),
    );
    expect(await screen.findByText('15 / 30 min')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Remover bloco de 10 minutos de Movimento do dia' }),
    );
    expect(await screen.findByText('5 / 30 min')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Diminuir Hidratação' })).toBeDisabled();
  });

  it('sono: stepper de 0,5 h a partir de 7', async () => {
    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(await screen.findByRole('button', { name: 'Aumentar 0,5 h de Sono' }));
    expect(await screen.findByText('7,5 h')).toBeInTheDocument();
  });

  it('Review Focus 1: virada de meia-noite grava no novo dia e zera a barra', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      now: new Date(2026, 10, 17, 23, 59, 30),
    });
    render(<TodayPage />);
    expect(await progress()).toHaveAttribute('aria-valuenow', '0');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(
      await screen.findByRole('checkbox', { name: 'Marcar Respiração de recuperação como feita' }),
    );
    await waitFor(async () => expect(await progress()).toHaveAttribute('aria-valuenow', '17'));
    expect((await getEntriesForDate('2026-11-18')).length).toBe(1);
    expect((await getEntriesForDate('2026-11-17')).length).toBe(0);
  });

  it('modo progressivo: 5 de 7 dias cumpridos com alvo 10 sobe para 15, uma vez por dia', async () => {
    const habits = await getHabits();
    const movement = { ...habits[0]!, target: 10, progressive: { enabled: true, ceiling: 30 } };
    await saveHabit(movement);
    for (const day of ['10', '11', '12', '13', '14']) {
      await setEntry(movement, `2026-11-${day}`, 10, [10]);
    }
    setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
    const { unmount } = render(<TodayPage />);
    expect(await screen.findByText('0 / 15 min')).toBeInTheDocument();
    unmount();
    render(<TodayPage />);
    expect(await screen.findByText('0 / 15 min')).toBeInTheDocument();
    expect((await getHabits())[0]?.target).toBe(15);
  });
});
