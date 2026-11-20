/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSION, isParticipantCode } from '@nexo/shared';
import { ThemeProvider } from '../../src/app/theme';
import { routes } from '../../src/app/router';
import { resetDbForTests } from '../../src/db/db';
import { getHabits, getSettings, outboxCount, setEntry, updateSettings } from '../../src/db';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('onboarding', () => {
  it('redireciona para /onboarding enquanto não concluído, sem barra de navegação', async () => {
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Boas-vindas' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull();
  });

  it('recusar o envio pede armazenamento persistente ao navegador', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
    const user = userEvent.setup();
    renderAt('/onboarding');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Usar sem enviar dados' }));
    await waitFor(() => expect(persist).toHaveBeenCalled());
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
  });

  it('mantém /checkin acessível sem onboarding', async () => {
    const router = renderAt('/checkin');
    expect(await screen.findByRole('heading', { name: 'Check-in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/checkin');
  });

  it('aceitar grava consentimento, participante e mostra código e chave', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(
      screen.getByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    );

    expect(await screen.findByText(/Guarde sua chave/)).toBeInTheDocument();
    const s = await getSettings();
    expect(s.consent?.granted).toBe(true);
    expect(s.consent?.version).toBe(CONSENT_VERSION);
    expect(isParticipantCode(s.participant?.code ?? '')).toBe(true);
    expect(s.participant?.registered).toBe(false);
    expect(s.onboardingDone).toBe(true);
    expect(screen.getByText(s.participant?.code ?? '')).toBeInTheDocument();
    expect(screen.getByText(s.participant?.key ?? '')).toBeInTheDocument();
    expect((await getHabits()).length).toBe(6);

    await user.click(screen.getByRole('button', { name: 'Começar' }));
    expect(
      await screen.findByRole('progressbar', { name: 'Progresso do dia' }),
    ).toBeInTheDocument();
  });

  it('recusar grava consent null e nada entra no outbox', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Usar sem enviar dados' }));

    expect(
      await screen.findByRole('progressbar', { name: 'Progresso do dia' }),
    ).toBeInTheDocument();
    const s = await getSettings();
    expect(s.consent).toBeNull();
    expect(s.participant).toBeNull();
    expect(s.onboardingDone).toBe(true);
    const habits = await getHabits();
    await setEntry(habits[3]!, '2026-11-17', 1);
    expect(await outboxCount()).toBe(0);
  });

  it('indica o passo atual (1, 2 e 3 de 3) e destaca o código em fonte monoespaçada', async () => {
    const user = userEvent.setup();
    renderAt('/');
    expect(await screen.findByText('Passo 1 de 3')).toBeInTheDocument();
    expect(screen.getByText(/não substitui acompanhamento/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Passo 2 de 3')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    );
    expect(await screen.findByText('Passo 3 de 3')).toBeInTheDocument();
    const s = await getSettings();
    const code = screen.getByText(s.participant!.code);
    expect(code.tagName).toBe('CODE');
    expect(code).toHaveClass('font-mono', 'tabular-nums');
  });

  it('exibe o texto completo do consentimento sob demanda', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Ler o texto completo' }));
    expect(screen.getByText(/Responsável pelos dados/)).toBeInTheDocument();
  });
});

describe('reconsentimento', () => {
  const old = { granted: true, version: 0, at: '2026-01-01T00:00:00.000Z' };
  const participant = { code: 'NEXO-ABCD', key: 'K'.repeat(24), registered: true };

  beforeEach(async () => {
    await updateSettings({ onboardingDone: true, consent: old, participant });
  });

  it('mostra o consentimento antes de qualquer tela e aceitar sobe a versão', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');
    await user.click(
      await screen.findByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const s = await getSettings();
    expect(s.consent?.version).toBe(CONSENT_VERSION);
    expect(s.consent?.granted).toBe(true);
    expect(s.participant).toEqual(participant);
  });

  it('reconsentimento é uma tela só, sem indicador de passos', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Passo \d de 3/)).toBeNull();
  });

  it('recusar zera o consentimento', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Usar sem enviar dados' }));
    await waitFor(async () => expect((await getSettings()).consent).toBeNull());
  });
});
