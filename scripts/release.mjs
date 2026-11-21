import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planRelease } from './lib/release-plan.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const kind = args.find((a) => !a.startsWith('--'));

// pnpm é um .cmd no Windows e não abre sem shell; os argumentos são fixos (a tag vem de um X.Y.Z validado).
function run(command, { capture = false } = {}) {
  const [bin, ...rest] = command;
  const result = spawnSync(bin, rest, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    shell: process.platform === 'win32' && bin === 'pnpm',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falhou (${result.status}): ${command.join(' ')}`);
  return capture ? result.stdout.trim() : '';
}

try {
  const pkgPath = `${root}package.json`;
  const pkgText = readFileSync(pkgPath, 'utf8');
  const current = JSON.parse(pkgText).version;

  run(['git', 'fetch', 'origin', 'main']);
  const plan = planRelease({
    current,
    kind,
    branch: run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }),
    dirty: run(['git', 'status', '--porcelain'], { capture: true }) !== '',
    behind: Number(run(['git', 'rev-list', '--count', 'HEAD..origin/main'], { capture: true })),
  });

  console.log(`Release ${current} -> ${plan.version} (${plan.tag})`);
  if (dryRun) {
    console.log('Modo --dry-run: nada foi alterado. Passos:');
    console.log(`  gravar version ${plan.version} no package.json`);
    for (const command of plan.commands) console.log(`  ${command.join(' ')}`);
  } else {
    writeFileSync(
      pkgPath,
      pkgText.replace(/^( {2}"version"\s*:\s*")[^"]*(")/m, `$1${plan.version}$2`),
    );
    for (const command of plan.commands) run(command);
    console.log(`Release ${plan.tag} publicado.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
