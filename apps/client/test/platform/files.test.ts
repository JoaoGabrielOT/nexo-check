import { afterEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const open = vi.fn();
const writeTextFile = vi.fn();
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...a: unknown[]) => save(...a),
  open: (...a: unknown[]) => open(...a),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...a: unknown[]) => writeTextFile(...a),
  readTextFile: (...a: unknown[]) => readTextFile(...a),
}));

async function loadNative() {
  vi.stubEnv('TAURI_ENV_PLATFORM', 'windows');
  vi.resetModules();
  return import('../../src/platform/files');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('extensionsFromAccept', () => {
  it('extrai só as extensões', async () => {
    const { extensionsFromAccept } = await import('../../src/platform/files');
    expect(extensionsFromAccept('application/json,.json')).toEqual(['json']);
    expect(extensionsFromAccept('.csv, text/csv')).toEqual(['csv']);
  });
});

describe('files nativo', () => {
  it('downloadFile salva pelo diálogo e grava o texto', async () => {
    save.mockResolvedValue('C:/x/b.json');
    const { downloadFile } = await loadNative();
    await downloadFile('b.json', '{}', 'application/json');
    expect(save).toHaveBeenCalledWith({
      defaultPath: 'b.json',
      filters: [{ name: 'json', extensions: ['json'] }],
    });
    expect(writeTextFile).toHaveBeenCalledWith('C:/x/b.json', '{}');
  });

  it('downloadFile cancelado não grava', async () => {
    save.mockResolvedValue(null);
    const { downloadFile } = await loadNative();
    await downloadFile('b.json', '{}', 'application/json');
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('pickFile devolve o texto do arquivo escolhido', async () => {
    open.mockResolvedValue('C:/x/b.json');
    readTextFile.mockResolvedValue('{"a":1}');
    const { pickFile } = await loadNative();
    await expect(pickFile('application/json,.json')).resolves.toBe('{"a":1}');
    expect(open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'json', extensions: ['json'] }],
    });
    expect(readTextFile).toHaveBeenCalledWith('C:/x/b.json');
  });

  it('pickFile cancelado devolve null', async () => {
    open.mockResolvedValue(null);
    const { pickFile } = await loadNative();
    await expect(pickFile('.json')).resolves.toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });
});
