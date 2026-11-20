import { isNative } from './runtime';

/** `application/json,.json` → `['json']`: só as extensões, para os filtros dos diálogos nativos. */
export function extensionsFromAccept(accept: string): string[] {
  return accept
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('.'))
    .map((part) => part.slice(1));
}

function filtersFor(extensions: string[]) {
  return extensions.length > 0 ? [{ name: extensions.join(', '), extensions }] : [];
}

function downloadWeb(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pickWeb(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

async function downloadNative(name: string, content: string): Promise<void> {
  const [{ save }, { writeTextFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const extensions = extensionsFromAccept(/\.[^.]+$/.exec(name)?.[0] ?? '');
  const path = await save({ defaultPath: name, filters: filtersFor(extensions) });
  if (path) await writeTextFile(path, content);
}

async function pickNative(accept: string): Promise<string | null> {
  const [{ open }, { readTextFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const path = await open({
    multiple: false,
    directory: false,
    filters: filtersFor(extensionsFromAccept(accept)),
  });
  return typeof path === 'string' ? readTextFile(path) : null;
}

export async function downloadFile(name: string, content: string, mime: string): Promise<void> {
  if (isNative()) return downloadNative(name, content);
  downloadWeb(name, content, mime);
}

/** Abre o seletor de arquivos e devolve o texto; `null` se a pessoa cancelar. */
export function pickFile(accept: string): Promise<string | null> {
  return isNative() ? pickNative(accept) : pickWeb(accept);
}
