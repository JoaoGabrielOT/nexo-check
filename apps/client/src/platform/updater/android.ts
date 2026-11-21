import { APP_VERSION } from '../../config';
import { evaluateRelease, fetchLatestRelease } from './github';
import type { InstallOutcome, UpdaterAdapter } from './types';

export interface AndroidUpdaterDeps {
  fetchFn: typeof fetch;
  currentVersion: string;
  installer: (
    req: { url: string; expectedSize: number },
    onProgress: (p: { downloaded: number; total: number }) => void,
  ) => Promise<'installing' | 'needs_permission' | 'ready'>;
}

export function createAndroidUpdater(deps: AndroidUpdaterDeps): UpdaterAdapter {
  return {
    async check() {
      const release = evaluateRelease(await fetchLatestRelease(deps.fetchFn), deps.currentVersion);
      return release ? { info: release.info, asset: release.asset } : null;
    },
    async install(candidate, onProgress): Promise<InstallOutcome> {
      const { asset } = candidate;
      if (!asset) throw new Error('Atualização sem APK.');
      return deps.installer({ url: asset.url, expectedSize: asset.size }, onProgress);
    },
  };
}

/** O plugin só funciona no app Tauri: carregado sob demanda para não pesar na web. */
export function createDefaultAndroidUpdater(): UpdaterAdapter {
  return createAndroidUpdater({
    fetchFn: (input, init) => fetch(input, init),
    currentVersion: APP_VERSION,
    installer: async (req, onProgress) => {
      const { downloadAndInstall } = await import('@nexo/tauri-plugin-apk-updater');
      return downloadAndInstall(req, onProgress);
    },
  });
}
