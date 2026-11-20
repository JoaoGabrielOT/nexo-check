import { z } from 'zod';

/** Data de calendário `YYYY-MM-DD`; rejeita dias que não existem (2026-02-30). */
export const dateKey = z.iso.date();
export const iso = z.iso.datetime();
