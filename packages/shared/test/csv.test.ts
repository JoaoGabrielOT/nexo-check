import { toCsv } from '../src/csv';

describe('toCsv', () => {
  test('BOM, separador ; e CRLF com aspas', () => {
    expect(toCsv([{ a: 'x;y', b: 1 }], ['a', 'b'])).toBe('﻿a;b\r\n"x;y";1\r\n');
  });
  test('aspas duplicadas, quebra de linha, null e boolean', () => {
    expect(
      toCsv(
        [
          { a: 'diz "oi"', b: null, c: true },
          { a: 'l1\nl2', b: 2, c: false },
        ],
        ['a', 'b', 'c'],
      ),
    ).toBe('﻿a;b;c\r\n"diz ""oi""";;true\r\n"l1\nl2";2;false\r\n');
  });
});
