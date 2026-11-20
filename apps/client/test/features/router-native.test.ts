import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteObject } from 'react-router';

function paths(rs: RouteObject[]): string[] {
  return rs.flatMap((r) => [r.path ?? '', ...paths(r.children ?? [])]);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rotas por plataforma', () => {
  it('o nativo não registra o admin', async () => {
    vi.stubEnv('TAURI_ENV_PLATFORM', 'windows');
    vi.resetModules();
    const { routes } = await import('../../src/app/router');
    expect(paths(routes).some((p) => p.startsWith('admin'))).toBe(false);
  });

  it('a web registra o admin', async () => {
    vi.stubEnv('TAURI_ENV_PLATFORM', '');
    vi.resetModules();
    const { routes } = await import('../../src/app/router');
    expect(paths(routes)).toContain('admin/*');
  });
});
