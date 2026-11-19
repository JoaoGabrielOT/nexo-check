import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSION } from '@nexo/shared';
import { ThemeProvider } from '../../src/app/theme';
import { routes } from '../../src/app/router';
import { resetDbForTests } from '../../src/db/db';
import { getHabits, getSettings } from '../../src/db';
import { httpConfig } from '../../src/sync/http';

const KEY = 'K'.repeat(24);
const NOW = '2026-11-18T10:00:00.000Z';
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const habit = {
  id: 'remote-habit',
  updatedAt: NOW,
  deletedAt: null,
  key: null,
  name: 'Leitura',
  description: '',
  type: 'boolean',
  target: 1,
  targetMax: null,
  active: true,
  order: 0,
  progressive: null,
};

beforeEach(async () => {
  await resetDbForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  httpConfig.retryDelaysMs = [0];
});
afterEach(() => vi.unstubAllGlobals());

describe('onboarding: já participo', () => {
  it('restaura com código e chave sem criar participante novo', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (init.method === 'GET') {
        return Promise.resolve(
          json(200, {
            changes: [
              {
                entity: 'habit',
                entityId: habit.id,
                updatedAt: NOW,
                deletedAt: null,
                payload: habit,
              },
            ],
            cursor: '5',
            hasMore: false,
          }),
        );
      }
      // Qualquer POST de registro seria um participante órfão.
      return Promise.resolve(json(200, { applied: 0, cursor: '5' }));
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(
      screen.getByRole('button', { name: 'Já participo: restaurar com meu código' }),
    );
    await user.type(await screen.findByLabelText('Código de participante'), 'nexo-wxyz');
    await user.type(screen.getByLabelText('Chave de recuperação'), KEY);
    await user.click(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(async () => expect((await getSettings()).onboardingDone).toBe(true));
    const s = await getSettings();
    expect(s.participant).toEqual({ code: 'NEXO-WXYZ', key: KEY, registered: true });
    expect(s.consent?.granted).toBe(true);
    expect(s.consent?.version).toBe(CONSENT_VERSION);
    expect((await getHabits()).map((h) => h.id)).toEqual(['remote-habit']);
    const posts = fetchMock.mock.calls.filter(
      ([u, i]) => i.method === 'POST' && u.endsWith('/v1/participants'),
    );
    expect(posts).toHaveLength(0);
  });

  it('credenciais incorretas: mostra o erro e não concede consentimento', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized', message: 'x' }));
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(
      screen.getByRole('button', { name: 'Já participo: restaurar com meu código' }),
    );
    await user.type(await screen.findByLabelText('Código de participante'), 'NEXO-WXYZ');
    await user.type(screen.getByLabelText('Chave de recuperação'), KEY);
    await user.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código ou chave incorretos.');
    const s = await getSettings();
    expect(s.consent).toBeNull();
    expect(s.participant).toBeNull();
  });
});
