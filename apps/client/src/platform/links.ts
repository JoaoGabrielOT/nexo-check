import { isNative } from './runtime';

/** Abre um link externo: pelo sistema no app nativo, em nova aba na web. */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** No WebView, links externos (`http(s)`) saem para o navegador do sistema. */
export function installExternalLinkHandler(
  root: Document,
  open: (url: string) => Promise<void> | void,
): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = anchor.href;
    if (!/^https?:/i.test(url)) return;
    if (new URL(url).origin === root.location.origin) return;
    event.preventDefault();
    void open(url);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
