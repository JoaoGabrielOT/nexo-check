/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nos fixtures */
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultHabits } from '@nexo/shared';
import { resetDbForTests } from '../../src/db/db';
import { adjustEntry, appendBlock, getEntriesForDate, removeBlock } from '../../src/db';

const DATE = '2026-01-02';
const habits = createDefaultHabits(
  new Date('2026-01-01T00:00:00Z'),
  (() => {
    let i = 0;
    return () => `h${++i}`;
  })(),
);
const byKey = (key: string) => habits.find((h) => h.key === key)!;
const only = async () => {
  const rows = await getEntriesForDate(DATE);
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

beforeEach(resetDbForTests);

describe('mutações atômicas de registro', () => {
  it('6 adjustEntry(+1) simultâneos somam 6', async () => {
    const h = byKey('hydration');
    await Promise.all(Array.from({ length: 6 }, () => adjustEntry(h, DATE, 1)));
    expect((await only()).value).toBe(6);
  });

  it('contador nunca fica abaixo de 0', async () => {
    const h = byKey('hydration');
    await adjustEntry(h, DATE, -1);
    expect((await only()).value).toBe(0);
  });

  it('horas de sono partem de 7 sem registro e respeitam o teto', async () => {
    const h = byKey('sleep');
    await adjustEntry(h, DATE, 0.5, { max: 24, from: 7 });
    expect((await only()).value).toBe(7.5);
    await adjustEntry(h, DATE, 100, { max: 24, from: 7 });
    expect((await only()).value).toBe(24);
  });

  it('3 appendBlock(10) simultâneos: 3 blocos e 30 minutos', async () => {
    const h = byKey('movement');
    await Promise.all([1, 2, 3].map(() => appendBlock(h, DATE, 10)));
    const row = await only();
    expect(row.blocks).toEqual([10, 10, 10]);
    expect(row.value).toBe(30);
  });

  it('removeBlock remove pelo índice e recalcula o total', async () => {
    const h = byKey('movement');
    await appendBlock(h, DATE, 5);
    await appendBlock(h, DATE, 10);
    await removeBlock(h, DATE, 0);
    const row = await only();
    expect(row.blocks).toEqual([10]);
    expect(row.value).toBe(10);
  });
});
