import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS } from '@nexo/shared';
import {
  checkForUpdates,
  dismissUpdate,
  getUpdaterAdapter,
  installUpdate,
  resetUpdaterForTests,
  setUpdaterAdapterForTests,
  useUpdaterState,
} from '../../src/platform/updater/store';
import {
  UpdateCheckError,
  type InstallProgress,
  type UpdaterAdapter,
} from '../../src/platform/updater/types';

const INFO = { version: '0.2.0', notes: '- x' };

function adapter(over: Partial<UpdaterAdapter> = {}): UpdaterAdapter {
  return {
    check: vi.fn().mockResolvedValue(INFO),
    install: vi.fn().mockResolvedValue('installing'),
    ...over,
  };
}
const state = () => renderHook(() => useUpdaterState()).result.current;

beforeEach(() => resetUpdaterForTests());
afterEach(() => {
  setUpdaterAdapterForTests(undefined);
  vi.useRealTimers();
});

describe('getUpdaterAdapter', () => {
  it('web e desktop (até o lado Windows ser plugado) não têm adaptador', () => {
    expect(getUpdaterAdapter('web')).toBeNull();
    expect(getUpdaterAdapter('desktop')).toBeNull();
  });
  it('android tem adaptador, sempre o mesmo (guarda o asset entre check e install)', () => {
    const a = getUpdaterAdapter('android');
    expect(a).not.toBeNull();
    expect(getUpdaterAdapter('android')).toBe(a);
  });
});

describe('checkForUpdates', () => {
  it('sem adaptador devolve unsupported', async () => {
    setUpdaterAdapterForTests(null);
    expect(await checkForUpdates()).toBe('unsupported');
  });

  it('check null devolve none e o estado continua idle', async () => {
    setUpdaterAdapterForTests(adapter({ check: vi.fn().mockResolvedValue(null) }));
    expect(await checkForUpdates()).toBe('none');
    expect(state()).toEqual({ status: 'idle' });
  });

  it('versão nova devolve available e guarda a informação', async () => {
    setUpdaterAdapterForTests(adapter());
    expect(await checkForUpdates()).toBe('available');
    expect(state()).toEqual({ status: 'available', info: INFO });
  });

  it('check que rejeita (offline) devolve error e não abre diálogo', async () => {
    setUpdaterAdapterForTests(adapter({ check: vi.fn().mockRejectedValue(new Error('offline')) }));
    expect(await checkForUpdates()).toBe('error');
    expect(state()).toEqual({ status: 'idle' });
  });

  it('durante o download devolve busy sem chamar check', async () => {
    let release!: (v: 'installing') => void;
    const a = adapter({
      install: vi.fn<UpdaterAdapter['install']>(
        () => new Promise((r) => (release = r as typeof release)),
      ),
    });
    setUpdaterAdapterForTests(a);
    await checkForUpdates();
    const pending = installUpdate();
    expect(state().status).toBe('downloading');
    expect(await checkForUpdates()).toBe('busy');
    expect(a.check).toHaveBeenCalledTimes(1);
    release('installing');
    await pending;
  });

  it('403 do GitHub: não insiste até passar o intervalo', async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockRejectedValue(new UpdateCheckError(403));
    setUpdaterAdapterForTests(adapter({ check }));
    expect(await checkForUpdates()).toBe('error');
    expect(await checkForUpdates()).toBe('error');
    expect(await checkForUpdates()).toBe('error');
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS + 1);
    await checkForUpdates();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('429 também bloqueia', async () => {
    const check = vi.fn().mockRejectedValue(new UpdateCheckError(429));
    setUpdaterAdapterForTests(adapter({ check }));
    await checkForUpdates();
    await checkForUpdates();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('erro 500 não bloqueia a próxima tentativa', async () => {
    const check = vi.fn().mockRejectedValue(new UpdateCheckError(500));
    setUpdaterAdapterForTests(adapter({ check }));
    await checkForUpdates();
    await checkForUpdates();
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe('installUpdate', () => {
  it('passa por downloading com o progresso e volta a idle em installing', async () => {
    let report!: (p: InstallProgress) => void;
    let release!: (v: 'installing') => void;
    setUpdaterAdapterForTests(
      adapter({
        install: vi.fn<UpdaterAdapter['install']>((onProgress) => {
          report = onProgress;
          return new Promise((r) => (release = r));
        }),
      }),
    );
    await checkForUpdates();
    const { result } = renderHook(() => useUpdaterState());
    const pending = installUpdate();
    await vi.waitFor(() => expect(result.current.status).toBe('downloading'));
    report({ downloaded: 50, total: 100 });
    await vi.waitFor(() =>
      expect(result.current).toEqual({
        status: 'downloading',
        info: INFO,
        progress: { downloaded: 50, total: 100 },
      }),
    );
    release('installing');
    await pending;
    await vi.waitFor(() => expect(result.current).toEqual({ status: 'idle' }));
  });

  it('needs_permission vai para needs_permission', async () => {
    setUpdaterAdapterForTests(adapter({ install: vi.fn().mockResolvedValue('needs_permission') }));
    await checkForUpdates();
    await installUpdate();
    expect(state()).toEqual({ status: 'needs_permission', info: INFO });
  });

  it('ready (app em segundo plano) vai para ready; instalar de novo chama o mesmo install', async () => {
    const install = vi.fn().mockResolvedValueOnce('ready').mockResolvedValueOnce('installing');
    setUpdaterAdapterForTests(adapter({ install }));
    await checkForUpdates();
    await installUpdate();
    expect(state()).toEqual({ status: 'ready', info: INFO });
    await installUpdate();
    expect(install).toHaveBeenCalledTimes(2);
    expect(state()).toEqual({ status: 'idle' });
  });

  it('restarting volta a idle', async () => {
    setUpdaterAdapterForTests(adapter({ install: vi.fn().mockResolvedValue('restarting') }));
    await checkForUpdates();
    await installUpdate();
    expect(state()).toEqual({ status: 'idle' });
  });

  it('install que rejeita vai para error mantendo a informação', async () => {
    setUpdaterAdapterForTests(adapter({ install: vi.fn().mockRejectedValue(new Error('x')) }));
    await checkForUpdates();
    await installUpdate();
    expect(state()).toEqual({ status: 'error', info: INFO });
  });

  it('sem versão disponível não faz nada', async () => {
    const a = adapter();
    setUpdaterAdapterForTests(a);
    await installUpdate();
    expect(a.install).not.toHaveBeenCalled();
  });

  it('dismissUpdate volta a idle', async () => {
    setUpdaterAdapterForTests(adapter());
    await checkForUpdates();
    dismissUpdate();
    expect(state()).toEqual({ status: 'idle' });
  });
});
