import { bumpVersion } from './version.mjs';

const KINDS = ['patch', 'minor', 'major'];

/**
 * Parte pura do release: valida as pré-condições e devolve a versão nova, a tag
 * e os comandos (sem shell) a executar depois de gravar a versão no package.json.
 */
export function planRelease({ current, kind, branch, dirty, behind }) {
  if (!KINDS.includes(kind)) throw new Error('Informe o tipo do release: patch, minor ou major.');
  if (branch !== 'main') throw new Error(`O release só roda na main (branch atual: ${branch}).`);
  if (dirty)
    throw new Error('Há alterações não commitadas; faça commit ou descarte antes do release.');
  if (behind > 0)
    throw new Error(
      `A main está ${behind} commit(s) atrás da origin/main; rode git pull --ff-only.`,
    );

  const version = bumpVersion(current, kind);
  const tag = `v${version}`;
  return {
    version,
    tag,
    commands: [
      ['node', 'scripts/sync-version.mjs'],
      ['pnpm', 'exec', 'git-cliff', '--tag', tag, '-o', 'CHANGELOG.md'],
      ['git', 'add', 'package.json', 'apps', 'packages', 'CHANGELOG.md'],
      ['git', 'commit', '-m', `chore(release): ${tag}`],
      ['git', 'tag', '-a', tag, '-m', tag],
      ['git', 'push', '--follow-tags', 'origin', 'main'],
    ],
  };
}
