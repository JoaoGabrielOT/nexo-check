import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('../../package.json', 'utf8')) as { version: string };

// O @nexo/shared é código-fonte TS: precisa ser embutido no bundle.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  noExternal: ['@nexo/shared'],
  define: { __APP_VERSION__: JSON.stringify(version) },
});
