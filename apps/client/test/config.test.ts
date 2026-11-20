import { describe, expect, it } from 'vitest';
import { normalizeApiUrl } from '../src/config';

describe('normalizeApiUrl', () => {
  it('remove barras finais e espaços', () => {
    expect(normalizeApiUrl('https://api.example/')).toBe('https://api.example');
    expect(normalizeApiUrl(' https://api.example/// ')).toBe('https://api.example');
  });
  it('mantém URLs sem barra final e usa o padrão local quando ausente ou vazio', () => {
    expect(normalizeApiUrl('https://api.example')).toBe('https://api.example');
    expect(normalizeApiUrl(undefined)).toBe('http://localhost:3333');
    expect(normalizeApiUrl('')).toBe('http://localhost:3333');
  });
});
