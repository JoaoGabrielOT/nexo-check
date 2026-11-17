let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

/** Só para testes: fixa o relógio; `null` restaura o relógio real. */
export function setNowForTests(fn: (() => Date) | null): void {
  override = fn;
}
