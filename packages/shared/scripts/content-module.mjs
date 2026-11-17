// Lógica pura e utilitários de disco do gerador de conteúdo (Node, sem dependências).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = join(here, '..', 'content');
export const OUT_FILE = join(here, '..', 'src', 'content.generated.ts');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Lê os .md e .json de content/: { 'aprender/bdnf.md': '...' }, com chaves POSIX. */
export function readContentFiles() {
  const files = {};
  for (const abs of walk(CONTENT_DIR)) {
    if (!/\.(md|json)$/.test(abs)) continue;
    const key = relative(CONTENT_DIR, abs).split(sep).join('/');
    files[key] = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  }
  return files;
}

export function generateContentModule(files) {
  const lines = Object.keys(files)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(files[k])},`);
  return [
    '// gerado — não editar; rode pnpm --filter @nexo/shared content:build',
    'export const RAW_CONTENT: Record<string, string> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
}

export function readGenerated() {
  return readFileSync(OUT_FILE, 'utf8').replace(/\r\n/g, '\n');
}
