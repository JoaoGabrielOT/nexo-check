import { makeEntry } from '@nexo/shared';
import type { Habit, HabitEntry } from '@nexo/shared';
import { db } from '../db';
import { now } from '../clock';
import { enqueueIfConsented } from './outbox';

type Next = { value: number; blocks: number[] };

/** Lê o registro atual dentro da transação rw e grava o resultado de `compute`: toques rápidos não se perdem. */
async function writeEntry(
  habit: Habit,
  date: string,
  compute: (current: HabitEntry | undefined) => Next,
): Promise<void> {
  await db.transaction('rw', [db.habitEntries, db.outbox, db.settings], async () => {
    const at = now();
    const found = await db.habitEntries.get(`${habit.id}:${date}`);
    const existing = found && found.deletedAt === null ? found : undefined;
    const { value, blocks } = compute(existing);
    // Mudar a meta depois nunca reescreve o dia: o snapshot do primeiro registro permanece.
    const row: HabitEntry = existing
      ? { ...existing, value, blocks: [...blocks], updatedAt: at.toISOString() }
      : makeEntry(habit, date, value, blocks, at);
    await db.habitEntries.put(row);
    await enqueueIfConsented('habitEntry', row);
  });
}

export function setEntry(
  habit: Habit,
  date: string,
  value: number,
  blocks: number[] = [],
): Promise<void> {
  return writeEntry(habit, date, () => ({ value, blocks }));
}

/** Soma `delta` ao valor atual (contador ou horas), limitado a [min, max]; sem registro parte de `from`. */
export function adjustEntry(
  habit: Habit,
  date: string,
  delta: number,
  opts: { min?: number; max?: number; from?: number } = {},
): Promise<void> {
  const { min = 0, max = Infinity, from = 0 } = opts;
  return writeEntry(habit, date, (cur) => ({
    value: Math.min(max, Math.max(min, (cur ? cur.value : from) + delta)),
    blocks: cur?.blocks ?? [],
  }));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Teto de blocos por dia (o servidor aceita até 200; o client fica bem abaixo). */
const MAX_BLOCKS = 48;

export function appendBlock(habit: Habit, date: string, minutes: number): Promise<void> {
  return writeEntry(habit, date, (cur) => {
    const blocks = [...(cur?.blocks ?? [])];
    // No teto, soma no último bloco: o total de minutos continua certo e o dia segue registrável.
    if (blocks.length >= MAX_BLOCKS)
      blocks[MAX_BLOCKS - 1] = (blocks[MAX_BLOCKS - 1] ?? 0) + minutes;
    else blocks.push(minutes);
    return { value: sum(blocks), blocks };
  });
}

export function removeBlock(habit: Habit, date: string, index: number): Promise<void> {
  return writeEntry(habit, date, (cur) => {
    const blocks = (cur?.blocks ?? []).filter((_, j) => j !== index);
    return { value: sum(blocks), blocks };
  });
}

export async function getEntriesBetween(from: string, to: string): Promise<HabitEntry[]> {
  const rows = await db.habitEntries.where('date').between(from, to, true, true).toArray();
  return rows.filter((e) => e.deletedAt === null);
}

export function getEntriesForDate(date: string): Promise<HabitEntry[]> {
  return getEntriesBetween(date, date);
}
