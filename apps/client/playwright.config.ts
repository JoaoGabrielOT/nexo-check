import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// O build é feito com uma origem de API falsa; as specs a interceptam com `page.route` (mock-api.ts).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // O service worker do PWA não faz parte do que se testa aqui e escondia requisições do mock.
    serviceWorkers: 'block',
    locale: 'pt-BR',
    reducedMotion: 'reduce',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'mobile-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_API_URL: 'http://api.test' },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
