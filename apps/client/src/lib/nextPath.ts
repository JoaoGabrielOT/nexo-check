/** Caminho de retorno vindo de `?next=`: só rotas internas ("/x"), nunca "//host" nem "/\host". */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}
