export type Platform = 'web' | 'desktop' | 'android';

/** `TAURI_ENV_PLATFORM` vem do Tauri no build nativo; vazio/ausente é a web. */
export function toPlatform(raw: string | undefined): Platform {
  if (!raw) return 'web';
  return raw === 'android' ? 'android' : 'desktop';
}

export const PLATFORM: Platform = toPlatform(import.meta.env.TAURI_ENV_PLATFORM);

export function isNative(p: Platform = PLATFORM): boolean {
  return p !== 'web';
}
