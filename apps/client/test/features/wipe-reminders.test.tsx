import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../src/app/theme';
import { resetDbForTests } from '../../src/db/db';
import { ensureDefaultHabits, updateSettings } from '../../src/db';
import { ConfigPage } from '../../src/features/settings/ConfigPage';

const cancelAll = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../src/platform/notifications', async (importActual) => ({
  ...(await importActual<typeof import('../../src/platform/notifications')>()),
  getNotificationAdapter: () => ({
    persistent: true,
    requestPermission: async () => true,
    getPermission: async () => 'granted' as const,
    schedule: async () => undefined,
    cancelAll,
  }),
}));

beforeEach(async () => {
  cancelAll.mockClear();
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  await updateSettings({ onboardingDone: true });
});
afterEach(cleanup);

it('apagar os dados neste aparelho cancela os lembretes nativos explicitamente', async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/config']}>
        <Routes>
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/onboarding" element={<p>tela de boas-vindas</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'Apagar todos os dados' }));
  await user.click(await screen.findByRole('button', { name: 'Apagar tudo' }));
  expect(await screen.findByText('tela de boas-vindas')).toBeInTheDocument();
  await waitFor(() => expect(cancelAll).toHaveBeenCalled());
});
