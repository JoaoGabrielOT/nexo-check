import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../../src/platform/storage';

const setStorage = (value: unknown) =>
  Object.defineProperty(navigator, 'storage', { value, configurable: true });

afterEach(() => setStorage(undefined));

describe('requestPersistentStorage', () => {
  it('chama navigator.storage.persist quando existe', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persist });
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('ignora a falta de suporte e as falhas', async () => {
    setStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
    setStorage({ persist: vi.fn().mockRejectedValue(new Error('negado')) });
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });
});
