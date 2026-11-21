import { describe, expect, it, vi } from 'vitest';
import { RELEASES_LATEST_API } from '../../src/config';
import { createAndroidUpdater } from '../../src/platform/updater/android';
import { UpdateCheckError } from '../../src/platform/updater/types';

const URL_APK =
  'https://github.com/JoaoGabrielOT/nexo-check/releases/download/v0.2.0/nexo-check-0.2.0.apk';
const RELEASE = {
  tag_name: 'v0.2.0',
  body: 'notas',
  assets: [{ name: 'nexo-check-0.2.0.apk', size: 500, browser_download_url: URL_APK }],
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function make(fetchFn: typeof fetch, installer = vi.fn()) {
  return {
    installer,
    updater: createAndroidUpdater({ fetchFn, currentVersion: '0.1.0', installer }),
  };
}

describe('createAndroidUpdater.check', () => {
  it('consulta releases/latest com o Accept do GitHub', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok(RELEASE));
    const { updater } = make(fetchFn);
    expect(await updater.check()).toEqual({ version: '0.2.0', notes: 'notas' });
    expect(fetchFn).toHaveBeenCalledWith(
      RELEASES_LATEST_API,
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
    );
  });

  it('devolve null quando não há versão nova', async () => {
    const { updater } = make(vi.fn().mockResolvedValue(ok({ ...RELEASE, tag_name: 'v0.1.0' })));
    expect(await updater.check()).toBeNull();
  });

  it.each([403, 429, 500])('HTTP %i rejeita com o status', async (status) => {
    const { updater } = make(vi.fn().mockResolvedValue(new Response('x', { status })));
    const err = await updater.check().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpdateCheckError);
    expect((err as UpdateCheckError).status).toBe(status);
  });

  it('offline (fetch rejeita) rejeita', async () => {
    const { updater } = make(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(updater.check()).rejects.toThrow();
  });

  it('corpo que não é JSON rejeita', async () => {
    const { updater } = make(vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(updater.check()).rejects.toThrow();
  });
});

describe('createAndroidUpdater.install', () => {
  it('passa url e tamanho ao instalador, repassa o progresso e devolve o status', async () => {
    const installer = vi.fn(
      async (
        _req: { url: string; expectedSize: number },
        onProgress: (p: { downloaded: number; total: number }) => void,
      ) => {
        onProgress({ downloaded: 10, total: 500 });
        return 'needs_permission' as const;
      },
    );
    const { updater } = make(vi.fn().mockResolvedValue(ok(RELEASE)), installer);
    await updater.check();
    const onProgress = vi.fn();
    expect(await updater.install(onProgress)).toBe('needs_permission');
    expect(installer).toHaveBeenCalledWith(
      { url: URL_APK, expectedSize: 500 },
      expect.any(Function),
    );
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 10, total: 500 });
  });

  it('repassa o status ready', async () => {
    const installer = vi.fn().mockResolvedValue('ready');
    const { updater } = make(vi.fn().mockResolvedValue(ok(RELEASE)), installer);
    await updater.check();
    expect(await updater.install(() => {})).toBe('ready');
  });

  it('sem check anterior rejeita', async () => {
    const { updater, installer } = make(vi.fn());
    await expect(updater.install(() => {})).rejects.toThrow();
    expect(installer).not.toHaveBeenCalled();
  });
});
