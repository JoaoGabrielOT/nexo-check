const BASE = 'http://local';

/** Caminho de retorno vindo de `?next=`: só rotas internas ("/x"); nunca outro host, esquema ou "//". */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/';
  // Controle, espaço e "\" são tratados de forma diferente por navegador e roteador.
  // eslint-disable-next-line no-control-regex -- é exatamente o que se quer barrar
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return '/';
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return '/';
    // "/%2F%2Fevil.com" decodifica para "//evil.com".
    if (decodeURIComponent(url.pathname).startsWith('//')) return '/';
    return raw;
  } catch {
    return '/';
  }
}
