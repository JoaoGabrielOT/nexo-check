import { afterEach, describe, expect, it, vi } from 'vitest';
import { installExternalLinkHandler } from '../../src/platform/links';

function anchor(href: string, target?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  if (target) a.target = target;
  document.body.append(a);
  return a;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('installExternalLinkHandler', () => {
  it('abre links externos com target _blank pelo sistema e cancela a navegação', () => {
    const open = vi.fn();
    installExternalLinkHandler(document, open);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor('https://who.int/x', '_blank').dispatchEvent(event);
    expect(open).toHaveBeenCalledWith('https://who.int/x');
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignora links internos', () => {
    const open = vi.fn();
    installExternalLinkHandler(document, open);
    anchor('/aprender').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).not.toHaveBeenCalled();
  });

  it('ignora mailto', () => {
    const open = vi.fn();
    installExternalLinkHandler(document, open);
    anchor('mailto:a@b.c').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('a função devolvida remove o listener', () => {
    const open = vi.fn();
    const off = installExternalLinkHandler(document, open);
    off();
    anchor('https://who.int/x', '_blank').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(open).not.toHaveBeenCalled();
  });
});
