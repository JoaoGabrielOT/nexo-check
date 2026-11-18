import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const rootPkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string };

export default defineConfig(({ mode }) => ({
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    mode !== 'test' &&
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: 'NEXO Check',
          short_name: 'NEXO Check',
          description: 'Checklist diário de bem-estar do projeto NEXO em Movimento.',
          lang: 'pt-BR',
          start_url: '/',
          display: 'standalone',
          theme_color: '#f7f5f2',
          background_color: '#f7f5f2',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: { navigateFallback: '/index.html' },
      }),
  ],
  resolve: {
    alias:
      mode === 'test'
        ? {
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./test/pwa-register-react.ts', import.meta.url),
            ),
          }
        : ({} as Record<string, string>),
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
}));
