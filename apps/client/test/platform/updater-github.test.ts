import { describe, expect, it } from 'vitest';
import { evaluateRelease, pickApkAsset } from '../../src/platform/updater/github';

const BASE = 'https://github.com/JoaoGabrielOT/nexo-check/releases/download/v0.2.0/';
const asset = (name: string, size = 1000, url = BASE + name) => ({
  name,
  size,
  browser_download_url: url,
});

describe('pickApkAsset', () => {
  it('prefere nexo-check-<versão>.apk a outro .apk', () => {
    const picked = pickApkAsset([asset('outro.apk'), asset('nexo-check-0.2.0.apk', 42)], '0.2.0');
    expect(picked).toEqual({
      name: 'nexo-check-0.2.0.apk',
      size: 42,
      url: BASE + 'nexo-check-0.2.0.apk',
    });
  });

  it('aceita .APK, mas só no formato nexo-check-<versão>', () => {
    expect(pickApkAsset([asset('nexo-check-0.2.0.APK')], '0.2.0')?.name).toBe(
      'nexo-check-0.2.0.APK',
    );
    expect(pickApkAsset([asset('qualquer.apk')], '0.2.0')).toBeNull();
    expect(pickApkAsset([asset('nexo-check-0.1.0.apk')], '0.2.0')).toBeNull();
  });

  it('ignora .exe, .sig e latest.json', () => {
    expect(
      pickApkAsset(
        [
          asset('nexo-check-0.2.0-setup.exe'),
          asset('nexo-check-0.2.0.apk.sig'),
          asset('latest.json'),
        ],
        '0.2.0',
      ),
    ).toBeNull();
  });

  it('ignora asset com size 0', () => {
    expect(pickApkAsset([asset('nexo-check-0.2.0.apk', 0)], '0.2.0')).toBeNull();
  });

  it('ignora URL fora do prefixo das releases do repositório', () => {
    const evil = asset('nexo-check-0.2.0.apk', 1000, 'https://evil.example/nexo-check-0.2.0.apk');
    const other = asset(
      'nexo-check-0.2.0.apk',
      1000,
      'https://github.com/outro/repo/releases/download/v0.2.0/nexo-check-0.2.0.apk',
    );
    expect(pickApkAsset([evil, other], '0.2.0')).toBeNull();
  });

  it('a versão não vira regex', () => {
    expect(pickApkAsset([asset('nexo-check-0x2x0.apk')], '0.2.0')).toBeNull();
  });
});

describe('evaluateRelease', () => {
  const release = (over: Record<string, unknown> = {}) => ({
    tag_name: 'v0.2.0',
    body: '- novidade',
    draft: false,
    prerelease: false,
    assets: [asset('nexo-check-0.2.0.apk', 1234)],
    ...over,
  });

  it('release mais nova devolve versão sem o v, notas e o asset', () => {
    const r = evaluateRelease(release(), '0.1.0');
    expect(r?.info).toEqual({ version: '0.2.0', notes: '- novidade' });
    expect(r?.asset.size).toBe(1234);
  });

  it('body nulo vira notas vazias', () => {
    expect(evaluateRelease(release({ body: null }), '0.1.0')?.info.notes).toBe('');
  });

  it('tag igual ou menor devolve null', () => {
    expect(evaluateRelease(release({ tag_name: 'v0.1.0' }), '0.1.0')).toBeNull();
    expect(evaluateRelease(release({ tag_name: 'v0.0.9' }), '0.1.0')).toBeNull();
  });

  it('draft e prerelease devolvem null', () => {
    expect(evaluateRelease(release({ draft: true }), '0.1.0')).toBeNull();
    expect(evaluateRelease(release({ prerelease: true }), '0.1.0')).toBeNull();
  });

  it('JSON inválido ou tag que não é versão devolve null', () => {
    expect(evaluateRelease({ tag_name: 'v0.2.0' }, '0.1.0')).toBeNull();
    expect(evaluateRelease(null, '0.1.0')).toBeNull();
    expect(evaluateRelease(release({ tag_name: 'banana' }), '0.1.0')).toBeNull();
  });

  it('release nova sem .apk válido devolve null', () => {
    expect(evaluateRelease(release({ assets: [asset('latest.json')] }), '0.1.0')).toBeNull();
  });
});
