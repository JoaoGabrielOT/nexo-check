/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly TAURI_ENV_PLATFORM?: 'windows' | 'linux' | 'darwin' | 'android' | 'ios';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
