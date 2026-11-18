/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TodayPage } from '../../src/features/today';
import { getDaySuggestion } from '../../src/features/today/suggestion';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import {
  ensureDefaultHabits,
  getEntriesForDate,
  getHabits,
  saveDailyLog,
  updateSettings,
} from '../../src/db';
import { mediaControl } from '../setup';

const DAY = '2026-11-17';

beforeEach(async () => {
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  await updateSettings({ onboardingDone: true });
  setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
});

afterEach(() => setNowForTests(null));

const renderToday = () =>
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );

const hero = () => screen.findByRole('region', { name: 'Movimento do dia' });

describe('getDaySuggestion', () => {
  const base = { movementMinutes: 0, movementTarget: 30, done: 0, total: 6, hour: 15 };

  it('tudo feito: dia completo', () => {
    expect(getDaySuggestion({ ...base, movementMinutes: 30, done: 6 })).toBe(
      'today.suggestion.allDone',
    );
  });

  it('menos de 10 min de movimento: caminhada de 10 min', () => {
    expect(getDaySuggestion({ ...base, movementMinutes: 5, done: 2 })).toBe(
      'today.suggestion.walk10',
    );
  });

  it('movimento abaixo da meta: mais um bloco', () => {
    expect(getDaySuggestion({ ...base, movementMinutes: 20, done: 3 })).toBe(
      'today.suggestion.keepGoing',
    );
  });

  it('movimento cumprido, outros hábitos pendentes: recuperar', () => {
    expect(getDaySuggestion({ ...base, movementMinutes: 30, done: 4 })).toBe(
      'today.suggestion.recover',
    );
  });
});

describe('Hoje redesenhada', () => {
  it('mostra a data longa como título, o rótulo "Hoje" e nenhuma saudação', async () => {
    renderToday();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Terça, 17 de novembro' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.queryByText(/bom dia|boa tarde|boa noite/i)).not.toBeInTheDocument();
  });

  it('linha de apoio com "X de Y hábitos" e a sugestão do dia', async () => {
    renderToday();
    expect(await screen.findByText('0 de 6 hábitos')).toBeInTheDocument();
    expect(screen.getByText('que tal 10 min de caminhada?')).toBeInTheDocument();
  });

  it('herói: +10 duas vezes grava dois blocos e mostra "20" e "de 30 min"', async () => {
    const user = userEvent.setup();
    renderToday();
    const add10 = await screen.findByRole('button', {
      name: 'Adicionar 10 minutos a Movimento do dia',
    });
    await user.click(add10);
    await user.click(add10);
    const region = await hero();
    expect(await within(region).findByText('20')).toBeInTheDocument();
    expect(within(region).getByText('de 30 min')).toBeInTheDocument();
    expect(
      within(region).getByText('Leve a moderado, no seu ritmo · 2 blocos'),
    ).toBeInTheDocument();
    const movement = (await getHabits()).find((h) => h.key === 'movement')!;
    const entry = (await getEntriesForDate(DAY)).find((e) => e.habitId === movement.id);
    expect(entry?.blocks).toEqual([10, 10]);
    expect(
      within(region).getAllByRole('button', { name: /^Remover bloco de 10 minutos/ }),
    ).toHaveLength(2);
  });

  it('tile de água: "Adicionar um copo" e "Remover um copo" com nomes acessíveis', async () => {
    const user = userEvent.setup();
    renderToday();
    const water = await screen.findByRole('region', { name: 'Hidratação' });
    const remove = within(water).getByRole('button', { name: 'Remover um copo' });
    expect(remove).toBeDisabled();
    await user.click(within(water).getByRole('button', { name: 'Adicionar um copo' }));
    await waitFor(() => expect(water).toHaveTextContent('1/8'));
    expect(within(water).getByRole('button', { name: 'Remover um copo' })).toBeEnabled();
  });

  it('respiração: botão de check alterna entre "Marcar como feita" e "Feita"', async () => {
    const user = userEvent.setup();
    renderToday();
    const box = await screen.findByRole('checkbox', {
      name: 'Marcar Respiração de recuperação como feita',
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    await waitFor(() => expect(box).toBeChecked());
    const tile = screen.getByRole('region', { name: 'Respiração de recuperação' });
    expect(within(tile).getByText('Feita')).toBeInTheDocument();
  });

  it('anuncia a mudança numa região aria-live educada', async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByRole('button', { name: 'Adicionar uma pausa' }));
    const live = screen.getByTestId('today-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(live).toHaveTextContent('Pausas ativas: 1 de 6'), {
      timeout: 2000,
    });
  });

  it('sem tela larga, não mostra o resumo lateral', async () => {
    renderToday();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('complementary', { name: 'Resumo do dia' })).not.toBeInTheDocument();
  });

  it('com (min-width: 1280px), mostra o resumo com anel, registro e dica do Aprender', async () => {
    mediaControl.matches = true;
    renderToday();
    const summary = await screen.findByRole('complementary', { name: 'Resumo do dia' });
    expect(within(summary).getByRole('img', { name: '0 de 6 hábitos hoje' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Registrar' })).toHaveAttribute(
      'href',
      '/registro',
    );
    // Movimento pendente: a dica aponta para o guia de caminhada.
    expect(within(summary).getByRole('link', { name: 'Caminhada' })).toHaveAttribute(
      'href',
      '/aprender/guia/caminhada',
    );
  });

  it('resumo mostra "Registrado" quando já existe registro de hoje', async () => {
    mediaControl.matches = true;
    await saveDailyLog({
      id: DAY,
      date: DAY,
      stress: 2,
      mood: 4,
      energy: 3,
      sleepQuality: 4,
      note: null,
    });
    renderToday();
    const summary = await screen.findByRole('complementary', { name: 'Resumo do dia' });
    expect(await within(summary).findByText('Registrado')).toBeInTheDocument();
  });
});
