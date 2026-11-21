import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS } from '@nexo/shared';
import { UpdateDialog, useUpdateChecks } from '../../src/features/update';
import {
  checkForUpdates,
  resetUpdaterForTests,
  setUpdaterAdapterForTests,
} from '../../src/platform/updater/store';
import type { InstallProgress, UpdaterAdapter } from '../../src/platform/updater/types';

const INFO = { version: '0.2.0', notes: '- melhorias **importantes**' };

function adapter(over: Partial<UpdaterAdapter> = {}): UpdaterAdapter {
  return {
    check: vi.fn().mockResolvedValue(INFO),
    install: vi.fn().mockResolvedValue('installing'),
    ...over,
  };
}

beforeEach(() => resetUpdaterForTests());
afterEach(() => {
  setUpdaterAdapterForTests(undefined);
  vi.useRealTimers();
});

async function open(a: UpdaterAdapter) {
  setUpdaterAdapterForTests(a);
  render(<UpdateDialog />);
  await act(async () => {
    await checkForUpdates();
  });
}

describe('UpdateDialog', () => {
  it('sem atualização não mostra nada', () => {
    render(<UpdateDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('available mostra a versão, as notas em Markdown e os botões', async () => {
    await open(adapter());
    expect(await screen.findByText('Nova versão 0.2.0')).toBeInTheDocument();
    expect(screen.getByText('importantes').tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: 'Atualizar agora' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depois' })).toBeInTheDocument();
  });

  it('Depois fecha o diálogo', async () => {
    const user = userEvent.setup();
    await open(adapter());
    await user.click(await screen.findByRole('button', { name: 'Depois' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Atualizar agora instala; downloading mostra a barra de progresso', async () => {
    const user = userEvent.setup();
    let report!: (p: InstallProgress) => void;
    const a = adapter({
      install: vi.fn<UpdaterAdapter['install']>((onProgress) => {
        report = onProgress;
        return new Promise(() => {});
      }),
    });
    await open(a);
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    act(() => report({ downloaded: 50, total: 100 }));
    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Baixando… 50%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Depois' })).not.toBeInTheDocument();
  });

  it('sem total conhecido a barra fica indeterminada', async () => {
    const user = userEvent.setup();
    let report!: (p: InstallProgress) => void;
    await open(
      adapter({
        install: vi.fn<UpdaterAdapter['install']>((onProgress) => {
          report = onProgress;
          return new Promise(() => {});
        }),
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    act(() => report({ downloaded: 50, total: null }));
    expect(await screen.findByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('needs_permission mostra o texto de permissão e o botão continua', async () => {
    const user = userEvent.setup();
    await open(adapter({ install: vi.fn().mockResolvedValue('needs_permission') }));
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    expect(await screen.findByText(/Permita que o NEXO Check instale apps/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  });

  it('ready oferece Instalar agora, que chama o install de novo', async () => {
    const user = userEvent.setup();
    const install = vi.fn().mockResolvedValueOnce('ready').mockResolvedValueOnce('installing');
    await open(adapter({ install }));
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    await user.click(await screen.findByRole('button', { name: 'Instalar agora' }));
    expect(install).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('error mostra a mensagem e deixa tentar de novo', async () => {
    const user = userEvent.setup();
    await open(adapter({ install: vi.fn().mockRejectedValue(new Error('x')) }));
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar agora. Tente de novo mais tarde.',
    );
    expect(screen.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  });
});

describe('useUpdateChecks', () => {
  it('verifica ao montar e de novo após o intervalo; desmontar limpa o intervalo', async () => {
    vi.useFakeTimers();
    const a = adapter({ check: vi.fn().mockResolvedValue(null) });
    setUpdaterAdapterForTests(a);
    const { unmount } = renderHook(() => useUpdateChecks());
    await vi.advanceTimersByTimeAsync(0);
    expect(a.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(a.check).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2);
    expect(a.check).toHaveBeenCalledTimes(2);
  });

  it('sem adaptador não agenda nada', async () => {
    vi.useFakeTimers();
    setUpdaterAdapterForTests(null);
    const spy = vi.spyOn(globalThis, 'setInterval');
    renderHook(() => useUpdateChecks());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
