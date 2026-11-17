import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';

describe('cn', () => {
  it('deixa a className do consumidor sobrescrever o raio do tema', () => {
    expect(cn('rounded-card', 'rounded-full')).toBe('rounded-full');
    expect(cn('rounded-panel', 'rounded-xl')).toBe('rounded-xl');
    expect(cn('rounded-xl', 'rounded-card')).toBe('rounded-card');
  });

  it('continua mesclando utilitários comuns', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
