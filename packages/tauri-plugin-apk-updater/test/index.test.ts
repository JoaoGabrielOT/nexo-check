import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  invoke: vi.fn(),
  addPluginListener: vi.fn(),
  unregister: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: core.invoke,
  addPluginListener: core.addPluginListener,
}));

import { downloadAndInstall, isAllowedApkUrl } from '../guest-js';

const URL_OK =
  'https://github.com/JoaoGabrielOT/nexo-check/releases/download/v0.1.0/nexo-check-0.1.0.apk';

beforeEach(() => {
  core.invoke.mockReset();
  core.invoke.mockResolvedValue({ status: 'installing' });
  core.addPluginListener.mockReset();
  core.addPluginListener.mockResolvedValue({ unregister: core.unregister });
  core.unregister.mockClear();
});

describe('isAllowedApkUrl', () => {
  it('aceita só o prefixo das releases do repositório', () => {
    expect(isAllowedApkUrl(URL_OK)).toBe(true);
    expect(
      isAllowedApkUrl('http://github.com/JoaoGabrielOT/nexo-check/releases/download/v1/a.apk'),
    ).toBe(false);
    expect(isAllowedApkUrl('https://github.com/outro/nexo-check/releases/download/v1/a.apk')).toBe(
      false,
    );
    expect(isAllowedApkUrl('https://github.com/JoaoGabrielOT/nexo-check/releases/latest')).toBe(
      false,
    );
    expect(
      isAllowedApkUrl('https://evil.example/JoaoGabrielOT/nexo-check/releases/download/v1/a.apk'),
    ).toBe(false);
    expect(
      isAllowedApkUrl(
        'https://github.com@evil.example/JoaoGabrielOT/nexo-check/releases/download/a.apk',
      ),
    ).toBe(false);
    expect(
      isAllowedApkUrl('https://github.com/JoaoGabrielOT/nexo-check/releases/download/../../x.apk'),
    ).toBe(false);
    expect(isAllowedApkUrl('não é url')).toBe(false);
    expect(isAllowedApkUrl(URL_OK.replace('https://github.com', 'HTTPS://GitHub.COM'))).toBe(true);
    expect(isAllowedApkUrl(URL_OK.replace('JoaoGabrielOT', 'joaogabrielot'))).toBe(false);
    expect(
      isAllowedApkUrl(
        'https://github.com/JoaoGabrielOT/nexo-check/releases/download/%2e%2e/%2E%2E/x.apk',
      ),
    ).toBe(false);
  });
});

describe('downloadAndInstall', () => {
  it('chama o comando nativo e devolve o status', async () => {
    await expect(downloadAndInstall({ url: URL_OK, expectedSize: 1234 })).resolves.toBe(
      'installing',
    );
    expect(core.invoke).toHaveBeenCalledWith('plugin:apk-updater|download_and_install', {
      payload: { url: URL_OK, expectedSize: 1234 },
    });
    expect(core.addPluginListener).not.toHaveBeenCalled();
  });

  it('devolve needs_permission quando falta a permissão de instalar', async () => {
    core.invoke.mockResolvedValue({ status: 'needs_permission' });
    await expect(downloadAndInstall({ url: URL_OK, expectedSize: 10 })).resolves.toBe(
      'needs_permission',
    );
  });

  it('devolve ready quando o app estava em segundo plano', async () => {
    core.invoke.mockResolvedValue({ status: 'ready' });
    await expect(downloadAndInstall({ url: URL_OK, expectedSize: 10 })).resolves.toBe('ready');
  });

  it('recusa URL fora das releases sem chamar o nativo', async () => {
    await expect(
      downloadAndInstall({ url: 'https://evil.example/a.apk', expectedSize: 10 }),
    ).rejects.toThrow(/url/i);
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'recusa tamanho esperado inválido (%s)',
    async (expectedSize) => {
      await expect(downloadAndInstall({ url: URL_OK, expectedSize })).rejects.toThrow(/tamanho/i);
      expect(core.invoke).not.toHaveBeenCalled();
    },
  );

  it('repassa o progresso e remove o listener no fim', async () => {
    core.addPluginListener.mockImplementation(
      async (_p: string, _e: string, cb: (p: unknown) => void) => {
        core.invoke.mockImplementation(async () => {
          cb({ downloaded: 50, total: 100 });
          return { status: 'installing' };
        });
        return { unregister: core.unregister };
      },
    );
    const onProgress = vi.fn();
    await downloadAndInstall({ url: URL_OK, expectedSize: 100 }, onProgress);
    expect(core.addPluginListener).toHaveBeenCalledWith(
      'apk-updater',
      'progress',
      expect.any(Function),
    );
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 50, total: 100 });
    expect(core.unregister).toHaveBeenCalledTimes(1);
  });

  it('remove o listener também quando o download falha', async () => {
    core.invoke.mockRejectedValue(new Error('size_mismatch'));
    await expect(downloadAndInstall({ url: URL_OK, expectedSize: 100 }, vi.fn())).rejects.toThrow(
      'size_mismatch',
    );
    expect(core.unregister).toHaveBeenCalledTimes(1);
  });

  it('segue sem progresso se o listener não puder ser registrado', async () => {
    core.addPluginListener.mockRejectedValue(new Error('indisponível'));
    await expect(downloadAndInstall({ url: URL_OK, expectedSize: 100 }, vi.fn())).resolves.toBe(
      'installing',
    );
  });
});
