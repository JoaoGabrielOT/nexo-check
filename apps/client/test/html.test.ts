import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

describe('index.html e manifesto', () => {
  it('viewport cobre a área segura (env(safe-area-inset-*) só funciona com viewport-fit=cover)', () => {
    expect(read('../index.html')).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  it('manifesto usa o fundo claro da marca na barra e na tela de abertura', () => {
    const config = read('../vite.config.ts');
    expect(config).toContain("theme_color: '#f7f5f2'");
    expect(config).toContain("background_color: '#f7f5f2'");
  });
});
