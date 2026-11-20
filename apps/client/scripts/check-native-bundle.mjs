// Falha se o build nativo carregar o que só existe na web: admin, service worker ou manifesto PWA.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2];
if (!dist || !existsSync(dist)) {
  console.error('Uso: node check-native-bundle.mjs <pasta-do-build>');
  process.exit(1);
}

const assets = existsSync(join(dist, 'assets')) ? readdirSync(join(dist, 'assets')) : [];
const found = [
  ...assets.filter((f) => /^AdminRoutes-.*\.js$/.test(f)).map((f) => `assets/${f}`),
  ...['sw.js', 'manifest.webmanifest'].filter((f) => existsSync(join(dist, f))),
];

if (found.length > 0) {
  console.error(`O bundle nativo não pode conter: ${found.join(', ')}`);
  process.exit(1);
}
console.log('Bundle nativo limpo (sem admin, sw.js nem manifest).');
