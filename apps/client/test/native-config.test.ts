import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

interface TauriConfig {
  identifier: string;
  build: { frontendDist: string };
  app: { windows?: { useHttpsScheme?: boolean }[]; security: { csp: string } };
  bundle: { android: { minSdkVersion: number } };
}

const config = JSON.parse(read('../src-tauri/tauri.conf.json')) as TauriConfig;

// Mudar qualquer um destes valores move a origem do WebView e apaga os dados locais (hábitos e registros).
describe('tauri.conf.json', () => {
  it('trava o identifier (dados locais e atualização por cima dependem dele)', () => {
    expect(config.identifier).toBe('io.github.joaogabrielot.nexocheck');
  });

  it('não ativa useHttpsScheme (trocaria a origem do IndexedDB)', () => {
    for (const w of config.app.windows ?? []) expect(w.useHttpsScheme).not.toBe(true);
  });

  it('empacota o build do Vite e exige Android 8 (minSdk 26)', () => {
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.bundle.android.minSdkVersion).toBe(26);
  });

  it('libera a API de produção e o GitHub na CSP', () => {
    const connect = config.app.security.csp
      .split(';')
      .find((d) => d.trim().startsWith('connect-src'));
    expect(connect).toContain('https://nexo-check-api.onrender.com');
    expect(connect).toContain('https://api.github.com');
  });
});

describe('index.html', () => {
  it('não tem script inline (a CSP do Tauri só aceita script-src self)', () => {
    const scripts = [...read('../index.html').matchAll(/<script\b([^>]*)>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs] of scripts) expect(attrs).toMatch(/\bsrc=/);
  });

  it('carrega o tema por script clássico e bloqueante, antes do React', () => {
    const html = read('../index.html');
    expect(html).toMatch(/<script src="\/theme-init\.js"><\/script>/);
    expect(read('../public/theme-init.js')).toContain("'nexo-theme'");
  });
});
