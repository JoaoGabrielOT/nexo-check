import { describe, expect, it } from 'vitest';
import { planRelease } from '../lib/release-plan.mjs';

const ok = { current: '0.0.0', kind: 'minor', branch: 'main', dirty: false, behind: 0 };

describe('planRelease', () => {
  it('planeja 0.0.0 -> 0.1.0 com os comandos na ordem', () => {
    const plan = planRelease(ok);
    expect(plan.version).toBe('0.1.0');
    expect(plan.tag).toBe('v0.1.0');
    expect(plan.commands).toEqual([
      ['node', 'scripts/sync-version.mjs'],
      ['pnpm', 'exec', 'git-cliff', '--tag', 'v0.1.0', '-o', 'CHANGELOG.md'],
      ['git', 'add', 'package.json', 'apps', 'packages', 'CHANGELOG.md'],
      ['git', 'commit', '-m', 'chore(release): v0.1.0'],
      ['git', 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0'],
      ['git', 'push', '--follow-tags', 'origin', 'main'],
    ]);
  });

  it('aceita patch e major', () => {
    expect(planRelease({ ...ok, current: '1.2.3', kind: 'patch' }).version).toBe('1.2.4');
    expect(planRelease({ ...ok, current: '1.2.3', kind: 'major' }).tag).toBe('v2.0.0');
  });

  it('recusa tipo inválido', () => {
    expect(() => planRelease({ ...ok, kind: 'banana' })).toThrow(/patch, minor ou major/);
    expect(() => planRelease({ ...ok, kind: undefined })).toThrow(/patch, minor ou major/);
  });

  it('recusa fora da main', () => {
    expect(() => planRelease({ ...ok, branch: 'feat/x' })).toThrow(/main/);
  });

  it('recusa árvore suja', () => {
    expect(() => planRelease({ ...ok, dirty: true })).toThrow(/alterações/);
  });

  it('recusa main atrás da origin/main', () => {
    expect(() => planRelease({ ...ok, behind: 2 })).toThrow(/atrás/);
  });

  it('recusa estouro de patch (vem de bumpVersion)', () => {
    expect(() => planRelease({ ...ok, current: '0.1.99', kind: 'patch' })).toThrow(/<= 99/);
  });
});
