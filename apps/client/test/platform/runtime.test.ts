import { describe, expect, it } from 'vitest';
import { isNative, toPlatform } from '../../src/platform/runtime';

describe('runtime', () => {
  it('mapeia a variável de build para a plataforma', () => {
    expect(toPlatform(undefined)).toBe('web');
    expect(toPlatform('')).toBe('web');
    expect(toPlatform('windows')).toBe('desktop');
    expect(toPlatform('android')).toBe('android');
  });

  it('isNative é falso na web', () => {
    expect(isNative('web')).toBe(false);
    expect(isNative('desktop')).toBe(true);
    expect(isNative('android')).toBe(true);
  });
});
