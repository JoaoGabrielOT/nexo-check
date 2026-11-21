import { addPluginListener, invoke } from '@tauri-apps/api/core';

// ready: APK baixado e conferido, mas o app estava em segundo plano (aguarda "Instalar agora").
export type InstallStatus = 'installing' | 'needs_permission' | 'ready';

export interface DownloadRequest {
  url: string;
  expectedSize: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

const ALLOWED_PREFIX = '/JoaoGabrielOT/nexo-check/releases/download/';

/** Só as releases públicas do repositório; o Kotlin repete a conferência antes de baixar. */
export function isAllowedApkUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'github.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname.startsWith(ALLOWED_PREFIX) &&
    !url.pathname.split('/').includes('..')
  );
}

export async function downloadAndInstall(
  req: DownloadRequest,
  onProgress?: (p: DownloadProgress) => void,
): Promise<InstallStatus> {
  if (!isAllowedApkUrl(req.url)) throw new Error('URL de atualização não permitida.');
  if (!Number.isInteger(req.expectedSize) || req.expectedSize <= 0) {
    throw new Error('Tamanho esperado do APK inválido.');
  }
  let listener: { unregister(): Promise<void> } | undefined;
  if (onProgress) {
    try {
      listener = await addPluginListener<DownloadProgress>('apk-updater', 'progress', onProgress);
    } catch {
      // O progresso é opcional: o download segue sem ele.
    }
  }
  try {
    const res = await invoke<{ status: InstallStatus }>('plugin:apk-updater|download_and_install', {
      payload: { url: req.url, expectedSize: req.expectedSize },
    });
    return res.status;
  } finally {
    await listener?.unregister().catch(() => undefined);
  }
}
