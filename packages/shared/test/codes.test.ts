import {
  generateParticipantCode,
  generateRecoveryKey,
  generateSessionCode,
  isParticipantCode,
  normalizeCode,
} from '../src/codes';

describe('codes', () => {
  test('1000 códigos de participante são válidos', () => {
    for (let i = 0; i < 1000; i++) expect(isParticipantCode(generateParticipantCode())).toBe(true);
  });
  test('chave de recuperação tem 24 caracteres do alfabeto Crockford', () => {
    expect(generateRecoveryKey()).toMatch(/^[0-9A-HJKMNP-TV-Z]{24}$/);
  });
  test('código de sessão', () => {
    for (let i = 0; i < 200; i++)
      expect(generateSessionCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  });
  test('rand determinístico', () => {
    expect(generateParticipantCode(() => 0)).toBe('NEXO-0000');
  });
  test('isParticipantCode rejeita formatos inválidos', () => {
    expect(isParticipantCode('NEXO-4F7U')).toBe(false);
    expect(isParticipantCode('NEXO-4F7')).toBe(false);
    expect(isParticipantCode('nexo-4f7k')).toBe(false);
  });
  test('normalizeCode', () => {
    expect(normalizeCode(' nexo-4f7k ')).toBe('NEXO-4F7K');
    expect(normalizeCode('NEXO-OI1L')).toBe('NEXO-0111');
    expect(normalizeCode('4f7k')).toBe('NEXO-4F7K');
    expect(normalizeCode(' ab3cde ')).toBe('AB3CDE');
  });
});

describe('chave de recuperação', () => {
  it('aceita a chave gerada e rejeita tamanhos e caracteres fora do alfabeto', async () => {
    const { generateRecoveryKey, isRecoveryKey, normalizeRecoveryKey } =
      await import('../src/codes');
    const key = generateRecoveryKey();
    expect(isRecoveryKey(key)).toBe(true);
    expect(isRecoveryKey(key.slice(1))).toBe(false);
    expect(isRecoveryKey(`${key}A`)).toBe(false);
    expect(isRecoveryKey(`${key.slice(0, 23)}U`)).toBe(false);
    expect(isRecoveryKey(key.toLowerCase())).toBe(false);
    expect(normalizeRecoveryKey(` ${key.toLowerCase()} `)).toBe(key);
  });
});
