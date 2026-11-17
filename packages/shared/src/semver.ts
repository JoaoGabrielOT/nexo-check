function parts(v: string): number[] {
  const core = v.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '';
  return core.split('.').map((p) => Number.parseInt(p, 10) || 0);
}

/** Compara `major.minor.patch`; aceita prefixo `v` e ignora pré-release (Fase A). */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
