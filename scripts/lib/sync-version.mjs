import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { androidVersionCode, versionCode } from './version.mjs';

// Crates do repositório que aparecem no Cargo.lock; os demais pertencem a terceiros.
const LOCAL_CRATES = ['nexo-check', 'tauri-plugin-apk-updater'];

const NATIVE_FILES = [
  'apps/client/src-tauri/tauri.conf.json',
  'apps/client/src-tauri/Cargo.toml',
  'apps/client/src-tauri/Cargo.lock',
  'packages/tauri-plugin-apk-updater/Cargo.toml',
];

const baseName = (path) => path.split(/[\\/]/).pop();

// Os arquivos usam sempre dois espaços (Prettier): o version de topo é o único com esse recuo.
// Se o padrão não casar, falha alto: ignorar em silêncio faria o --check mentir.
function replaceOrThrow(text, re, replacement, path, what) {
  if (!re.test(text)) throw new Error(`${path}: não encontrei ${what}`);
  return text.replace(re, replacement);
}

function syncPackageJson(text, version, path) {
  return replaceOrThrow(
    text,
    /^( {2}"version"\s*:\s*")[^"]*(")/m,
    `$1${version}$2`,
    path,
    'a linha "version" de topo (recuo de 2 espaços)',
  );
}

function syncTauriConf(text, version, path) {
  return replaceOrThrow(
    syncPackageJson(text, version, path),
    /("versionCode"\s*:\s*)\d+/,
    `$1${androidVersionCode(version)}`,
    path,
    '"versionCode"',
  );
}

function syncCargoToml(text, version, path) {
  const lines = text.split('\n');
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\[/.test(lines[i])) inPackage = /^\[package\]\s*$/.test(lines[i]);
    else if (inPackage && /^version\s*=\s*"/.test(lines[i])) {
      lines[i] = lines[i].replace(/^(version\s*=\s*")[^"]*(")/, `$1${version}$2`);
      return lines.join('\n');
    }
  }
  throw new Error(`${path}: não encontrei a linha version em [package]`);
}

function syncCargoLock(text, version) {
  const names = LOCAL_CRATES.map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
  const re = new RegExp(`(\\nname = "(?:${names})"\\r?\\nversion = ")[^"]*(")`, 'g');
  return text.replace(re, `$1${version}$2`);
}

/** Recebe caminho -> conteúdo e devolve só os arquivos que mudariam. */
export function syncVersionInFiles(files, version) {
  versionCode(version); // valida X.Y.Z e o limite de 99
  const clean = String(version).trim().replace(/^v/, '');
  const changed = {};
  for (const [path, text] of Object.entries(files)) {
    const name = baseName(path);
    let next = text;
    if (name === 'package.json') next = syncPackageJson(text, clean, path);
    else if (name === 'tauri.conf.json') next = syncTauriConf(text, clean, path);
    else if (name === 'Cargo.toml') next = syncCargoToml(text, clean, path);
    else if (name === 'Cargo.lock') next = syncCargoLock(text, clean);
    if (next !== text) changed[path] = next;
  }
  return changed;
}

function listTargets(root) {
  const targets = [];
  for (const group of ['apps', 'packages']) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${group}/${entry.name}/package.json`;
      if (entry.isDirectory() && existsSync(join(root, rel))) targets.push(rel);
    }
  }
  return [...targets, ...NATIVE_FILES.filter((rel) => existsSync(join(root, rel)))];
}

/**
 * Propaga a versão do package.json raiz. Com `check`, não grava nada.
 * Devolve { version, changed } com os caminhos (relativos, com `/`) divergentes.
 */
export function runSync({ root, check = false }) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const files = Object.fromEntries(
    listTargets(root).map((rel) => [rel, readFileSync(join(root, rel), 'utf8')]),
  );
  const changed = syncVersionInFiles(files, version);
  if (!check) {
    for (const [rel, text] of Object.entries(changed)) writeFileSync(join(root, rel), text);
  }
  return { version, changed: Object.keys(changed) };
}
