import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSync, syncVersionInFiles } from '../lib/sync-version.mjs';

const pkg = `{
  "name": "client",
  "version": "0.0.0",
  "dependencies": {
    "foo": { "version": "1.0.0" }
  }
}
`;
const tauriConf = `{
  "productName": "NEXO Check",
  "version": "0.0.0",
  "bundle": {
    "android": { "minSdkVersion": 26, "versionCode": 1 }
  }
}
`;
const cargoToml = `[package]
name = "nexo-check"
version = "0.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
`;
const cargoLock = `[[package]]
name = "nexo-check"
version = "0.0.0"
dependencies = [
 "tauri",
]

[[package]]
name = "serde"
version = "1.0.0"

[[package]]
name = "tauri-plugin-apk-updater"
version = "0.0.0"
`;

describe('syncVersionInFiles', () => {
  it('troca só o version de topo do package.json', () => {
    const out = syncVersionInFiles({ 'apps/client/package.json': pkg }, '0.2.0');
    const text = out['apps/client/package.json'];
    expect(text).toBe(pkg.replace('"version": "0.0.0"', '"version": "0.2.0"'));
    expect(JSON.parse(text).dependencies.foo.version).toBe('1.0.0');
  });

  it('atualiza version e versionCode do tauri.conf.json', () => {
    const out = syncVersionInFiles({ 'apps/client/src-tauri/tauri.conf.json': tauriConf }, '0.2.0');
    const json = JSON.parse(out['apps/client/src-tauri/tauri.conf.json']);
    expect(json.version).toBe('0.2.0');
    expect(json.bundle.android.versionCode).toBe(200);
    expect(json.bundle.android.minSdkVersion).toBe(26);
  });

  it('grava versionCode 1 para 0.0.0', () => {
    const conf = tauriConf
      .replace('"versionCode": 1', '"versionCode": 200')
      .replace('0.0.0', '0.2.0');
    const out = syncVersionInFiles({ 'apps/client/src-tauri/tauri.conf.json': conf }, '0.0.0');
    expect(
      JSON.parse(out['apps/client/src-tauri/tauri.conf.json']).bundle.android.versionCode,
    ).toBe(1);
  });

  it('muda só [package].version no Cargo.toml', () => {
    const out = syncVersionInFiles({ 'apps/client/src-tauri/Cargo.toml': cargoToml }, '0.2.0');
    expect(out['apps/client/src-tauri/Cargo.toml']).toBe(
      cargoToml.replace('version = "0.0.0"', 'version = "0.2.0"'),
    );
  });

  it('no Cargo.lock muda só os crates locais', () => {
    const out = syncVersionInFiles({ 'apps/client/src-tauri/Cargo.lock': cargoLock }, '0.2.0');
    const text = out['apps/client/src-tauri/Cargo.lock'];
    expect(text).toContain('name = "nexo-check"\nversion = "0.2.0"');
    expect(text).toContain('name = "tauri-plugin-apk-updater"\nversion = "0.2.0"');
    expect(text).toContain('name = "serde"\nversion = "1.0.0"');
  });

  it('Cargo.lock sem os crates é ignorado', () => {
    const lock = '[[package]]\nname = "serde"\nversion = "1.0.0"\n';
    expect(syncVersionInFiles({ 'Cargo.lock': lock }, '0.2.0')).toEqual({});
  });

  it('arquivo já na versão não aparece no resultado (idempotente)', () => {
    const files = {
      'package.json': pkg,
      'src-tauri/tauri.conf.json': tauriConf
        .replace('"versionCode": 1', '"versionCode": 200')
        .replace('0.0.0', '0.2.0'),
    };
    const once = syncVersionInFiles(files, '0.2.0');
    expect(Object.keys(once)).toEqual(['package.json']);
    expect(syncVersionInFiles({ ...files, ...once }, '0.2.0')).toEqual({});
  });
});

describe('runSync', () => {
  let root;
  const write = (rel, content) => {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  };
  const read = (rel) => readFileSync(join(root, rel), 'utf8');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sync-version-'));
    write('package.json', pkg.replace('0.0.0', '0.2.0'));
    write('apps/client/package.json', pkg);
    write('packages/ui/package.json', pkg.replace('0.0.0', '0.2.0'));
    write('apps/client/src-tauri/tauri.conf.json', tauriConf);
    write('apps/client/src-tauri/Cargo.toml', cargoToml);
    write('apps/client/src-tauri/Cargo.lock', cargoLock);
    write('packages/tauri-plugin-apk-updater/Cargo.toml', cargoToml);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('--check lista a divergência sem gravar', () => {
    const r = runSync({ root, check: true });
    expect(r.changed).toContain('apps/client/package.json');
    expect(r.changed).toContain('apps/client/src-tauri/Cargo.lock');
    expect(r.changed).not.toContain('packages/ui/package.json');
    expect(read('apps/client/package.json')).toBe(pkg);
  });

  it('grava os arquivos divergentes e depois não há mais nada a mudar', () => {
    const r = runSync({ root, check: false });
    expect(r.version).toBe('0.2.0');
    expect(read('apps/client/package.json')).toContain('"version": "0.2.0"');
    expect(read('packages/tauri-plugin-apk-updater/Cargo.toml')).toContain('version = "0.2.0"');
    expect(runSync({ root, check: true }).changed).toEqual([]);
    expect(runSync({ root, check: false }).changed).toEqual([]);
  });

  it('lança para versão inválida na raiz', () => {
    write('package.json', pkg.replace('0.0.0', 'abc'));
    expect(() => runSync({ root, check: true })).toThrow();
  });
});
