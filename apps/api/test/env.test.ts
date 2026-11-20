import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ADMIN_PASSWORD: 'senha-segura-123',
  ADMIN_JWT_SECRET: 'x'.repeat(32),
  PUBLIC_WEB_URL: 'https://nexo.example',
};

describe('parseEnv', () => {
  it('aceita ambiente válido e aplica padrões', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3333);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('trata variáveis opcionais vazias como ausentes', () => {
    const env = parseEnv({ ...base, DIRECT_URL: '', PORT: '', NODE_ENV: '' });
    expect(env.DIRECT_URL).toBeUndefined();
    expect(env.PORT).toBe(3333);
  });

  it('lê TRUST_PROXY_HOPS numérico e trata vazio como padrão', () => {
    expect(parseEnv({ ...base, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(parseEnv({ ...base, TRUST_PROXY_HOPS: '' }).TRUST_PROXY_HOPS).toBe(1);
  });

  it('normaliza CORS_ORIGINS (espaços, barra final, entradas vazias)', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: ' https://a.example/ , ,https://b.example//,',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('em produção exige CORS_ORIGINS não vazio', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: ' , ' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example' }).CORS_ORIGINS,
    ).toEqual(['https://a.example']);
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).CORS_ORIGINS).toEqual([]);
  });

  it('CLIENT_IP_HEADER aceita só cabeçalhos que o proxy sobrescreve', () => {
    for (const h of ['cf-connecting-ip', 'True-Client-IP', ' x-real-ip ']) {
      expect(parseEnv({ ...base, CLIENT_IP_HEADER: h }).CLIENT_IP_HEADER).toBe(
        h.trim().toLowerCase(),
      );
    }
    expect(parseEnv({ ...base, CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER).toBeUndefined();
    for (const h of ['x-forwarded-for', 'user-agent', 'x-custom']) {
      expect(() => parseEnv({ ...base, CLIENT_IP_HEADER: h })).toThrow(/CLIENT_IP_HEADER/);
    }
  });

  it('rejeita ADMIN_PASSWORD ausente', () => {
    const rest: Record<string, string | undefined> = { ...base, ADMIN_PASSWORD: undefined };
    expect(() => parseEnv(rest)).toThrow(/ADMIN_PASSWORD/);
  });

  it('rejeita ADMIN_JWT_SECRET curto sem vazar o valor na mensagem', () => {
    const secret = 'segredo-curto-9';
    let message = '';
    try {
      parseEnv({ ...base, ADMIN_JWT_SECRET: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/ADMIN_JWT_SECRET/);
    expect(message).not.toContain(secret);
  });
});
