/** Sem barra final (os caminhos da API já começam com `/`) e com padrão local. */
export function normalizeApiUrl(url: string | undefined): string {
  const clean = (url ?? '').trim().replace(/\/+$/, '');
  return clean || 'http://localhost:3333';
}

export const API_URL: string = normalizeApiUrl(import.meta.env.VITE_API_URL);
export const APP_VERSION: string = __APP_VERSION__;

export const RELEASES_LATEST_API =
  'https://api.github.com/repos/JoaoGabrielOT/nexo-check/releases/latest';
export const RELEASE_DOWNLOAD_PREFIX =
  'https://github.com/JoaoGabrielOT/nexo-check/releases/download/';
