import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '../../src/db/db';
import type { Platform } from '../../src/platform/runtime';
import type { PermissionStatus } from '../../src/platform/notifications';

const env = vi.hoisted(() => ({
  platform: 'web' as Platform,
  permission: 'granted' as PermissionStatus,
  request: vi.fn(),
}));

vi.mock('../../src/platform/runtime', async (importActual) => ({
  ...(await importActual<typeof import('../../src/platform/runtime')>()),
  get PLATFORM() {
    return env.platform;
  },
}));

vi.mock('../../src/platform/notifications', async (importActual) => ({
  ...(await importActual<typeof import('../../src/platform/notifications')>()),
  getNotificationAdapter: () => ({
    persistent: false,
    requestPermission: async () => {
      env.request();
      env.permission = 'denied';
      return false;
    },
    getPermission: async () => env.permission,
    schedule: async () => undefined,
    cancelAll: async () => undefined,
  }),
}));

import { RemindersSection } from '../../src/features/settings/RemindersSection';

beforeEach(async () => {
  env.permission = 'granted';
  env.request.mockClear();
  await resetDbForTests();
});
afterEach(cleanup);

describe('RemindersSection por plataforma', () => {
  it('web: mantém o aviso de que só aparece com o app aberto', async () => {
    env.platform = 'web';
    render(<RemindersSection />);
    expect(await screen.findByText(/Na web, os lembretes só aparecem/)).toBeInTheDocument();
  });

  it('Windows: avisa que os lembretes só aparecem com o app aberto', async () => {
    env.platform = 'desktop';
    render(<RemindersSection />);
    expect(
      await screen.findByText(/No Windows, os lembretes aparecem enquanto o app estiver aberto/),
    ).toBeInTheDocument();
  });

  it('Android: avisa sobre o atraso da economia de bateria', async () => {
    env.platform = 'android';
    render(<RemindersSection />);
    expect(await screen.findByText(/economia de bateria/)).toBeInTheDocument();
  });

  it('nativo bloqueado: orienta liberar nas configurações do sistema', async () => {
    env.platform = 'desktop';
    env.permission = 'denied';
    render(<RemindersSection />);
    expect(await screen.findByText(/Libere nas configurações do sistema/)).toBeInTheDocument();
  });

  it('recusar o pedido no nativo leva ao aviso deniedNative; depois não pede de novo', async () => {
    env.platform = 'android';
    env.permission = 'default';
    const user = userEvent.setup();
    render(<RemindersSection />);
    const toggle = await screen.findByRole('switch', { name: 'Ativar lembrete de Água' });
    await user.click(toggle);
    expect(await screen.findByText(/Libere nas configurações do sistema/)).toBeInTheDocument();
    expect(env.request).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('switch', { name: 'Ativar lembrete de Pausa ativa' }));
    expect(env.request).toHaveBeenCalledTimes(1);
  });
});
