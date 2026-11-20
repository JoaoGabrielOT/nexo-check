import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig;

describe('vercel.json', () => {
  it('não reescreve /assets/* para o index (chunk antigo faltando dá 404, não HTML)', () => {
    const source = new RegExp(`^${config.rewrites[0]?.source}$`);
    expect(source.test('/assets/index-abc.js')).toBe(false);
    expect(source.test('/config')).toBe(true);
    expect(source.test('/')).toBe(true);
  });

  it('envia os cabeçalhos de segurança em todas as rotas, sem CSP completa', () => {
    const all = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
    const get = (k: string) => all.find((h) => h.key === k)?.value;
    expect(get('X-Frame-Options')).toBe('DENY');
    expect(get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
