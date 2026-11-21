import { describe, expect, it } from 'vitest';
import { androidVersionCode, bumpVersion, versionCode } from '../lib/version.mjs';

describe('versionCode', () => {
  it('aplica major*10000 + minor*100 + patch', () => {
    expect(versionCode('0.1.0')).toBe(100);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('v2.0.1')).toBe(20001);
  });

  it('rejeita minor ou patch acima de 99 e versões inválidas', () => {
    expect(() => versionCode('0.1.100')).toThrow();
    expect(() => versionCode('0.100.0')).toThrow();
    expect(() => versionCode('abc')).toThrow();
    expect(() => versionCode('1.2')).toThrow();
  });

  it('androidVersionCode grava 1 para 0.0.0', () => {
    expect(androidVersionCode('0.0.0')).toBe(1);
    expect(androidVersionCode('0.1.0')).toBe(100);
  });
});

describe('bumpVersion', () => {
  it('sobe patch, minor e major', () => {
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
    expect(bumpVersion('0.1.9', 'patch')).toBe('0.1.10');
    expect(bumpVersion('0.9.3', 'minor')).toBe('0.10.0');
    expect(bumpVersion('1.4.2', 'major')).toBe('2.0.0');
  });

  it('lança quando minor ou patch passam de 99', () => {
    expect(() => bumpVersion('0.1.99', 'patch')).toThrow();
    expect(() => bumpVersion('0.99.0', 'minor')).toThrow();
  });

  it('lança para tipo ou versão inválidos', () => {
    expect(() => bumpVersion('0.1.0', 'foo')).toThrow();
    expect(() => bumpVersion('x', 'patch')).toThrow();
  });
});
