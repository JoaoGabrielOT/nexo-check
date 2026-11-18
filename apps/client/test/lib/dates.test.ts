import { describe, expect, it } from 'vitest';
import i18n from '../../src/i18n';
import { formatLongDate } from '../../src/lib/dates';

describe('formatLongDate', () => {
  it('escreve "Terça, 17 de novembro" sem o "-feira"', () => {
    expect(formatLongDate('2026-11-17', i18n.t)).toBe('Terça, 17 de novembro');
    expect(formatLongDate('2026-11-22', i18n.t)).toBe('Domingo, 22 de novembro');
  });
});
