import { fileURLToPath } from 'node:url';
import { runSync } from './lib/sync-version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');

try {
  const { version, changed } = runSync({ root, check });
  if (changed.length === 0) {
    console.log(`Versão ${version}: tudo sincronizado.`);
  } else if (check) {
    console.error(`Versão ${version}: arquivos fora de sincronia (rode pnpm version:sync):`);
    for (const file of changed) console.error(`  ${file}`);
    process.exitCode = 1;
  } else {
    console.log(`Versão ${version}: atualizados`);
    for (const file of changed) console.log(`  ${file}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
