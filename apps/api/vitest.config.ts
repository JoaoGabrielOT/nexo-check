import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    // O primeiro boot do Postgres embarcado (initdb + migrações) é lento.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Um único banco compartilhado: os arquivos de teste rodam em série.
    fileParallelism: false,
  },
});
