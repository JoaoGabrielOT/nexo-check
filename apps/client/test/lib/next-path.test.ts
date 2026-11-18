import { describe, expect, it } from 'vitest';
import { safeNext } from '../../src/lib/nextPath';

describe('safeNext', () => {
  it('aceita rotas internas, com query e hash', () => {
    expect(safeNext('/checkin?c=ABC234')).toBe('/checkin?c=ABC234');
    expect(safeNext('/projeto#x')).toBe('/projeto#x');
  });

  it.each([
    null,
    '',
    'javascript:alert(1)',
    '/%2F%2Fevil.com',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    ' /x',
    'https://evil.com',
  ])('rejeita %j', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });
});
