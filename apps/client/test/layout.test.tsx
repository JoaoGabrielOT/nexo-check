/* eslint-disable @typescript-eslint/no-non-null-assertion -- o link sempre está no header */
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resetDbForTests } from '../src/db/db';
import { updateSettings } from '../src/db';
import { ThemeProvider } from '../src/app/theme';
import { mediaControl } from './setup';
import { routes } from '../src/app/router';

beforeEach(async () => {
  await resetDbForTests();
  await updateSettings({ onboardingDone: true });
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

describe('layout', () => {
  // Fora dos testes: um assert que falha não deixa o stub vazar para os seguintes.
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os 5 itens de navegação com nome acessível', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    for (const name of ['Hoje', 'Registro', 'Progresso', 'Aprender', 'Projeto']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(nav.querySelectorAll('a')).toHaveLength(5);
  });

  it('marca o item ativo com aria-current="page"', async () => {
    renderAt('/registro');
    expect(await screen.findByRole('link', { name: 'Registro' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('mantém o item ativo em subrotas', async () => {
    renderAt('/aprender/guia/respiracao');
    expect(await screen.findByRole('link', { name: 'Aprender' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('tem link para pular ao conteúdo, link de configurações e título da página', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    );
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/config');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
  });

  describe('fundo do cabeçalho (sentinela no topo do main)', () => {
    type FakeObserver = {
      cb: IntersectionObserverCallback;
      options?: IntersectionObserverInit;
      target?: Element;
      disconnect: Mock;
    };
    let observers: FakeObserver[];

    beforeEach(() => {
      observers = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          disconnect = vi.fn();
          constructor(
            public cb: IntersectionObserverCallback,
            public options?: IntersectionObserverInit,
          ) {
            observers.push(this as unknown as FakeObserver);
          }
          observe(target: Element) {
            (this as unknown as FakeObserver).target = target;
          }
          unobserve() {}
          takeRecords() {
            return [];
          }
        },
      );
    });
    afterEach(() => vi.restoreAllMocks());

    const fire = (obs: FakeObserver, isIntersecting: boolean) =>
      act(() =>
        obs.cb(
          [{ isIntersecting } as IntersectionObserverEntry],
          obs as unknown as IntersectionObserver,
        ),
      );

    it('fica transparente no topo e ganha fundo quando o sentinela passa por baixo', async () => {
      renderAt('/');
      const header = (await screen.findByRole('link', { name: 'Configurações' })).closest(
        'header',
      )!;
      expect(header).toHaveAttribute('data-scrolled', 'false');
      expect(header.className).not.toMatch(/(^|\s)bg-bg(\s|$)/);
      const obs = observers.at(-1)!;
      // O sentinela é o primeiro filho do main, com 1 px, antes do conteúdo da página.
      expect(obs.target).toBe(screen.getByRole('main').firstElementChild);
      expect(obs.options?.threshold).toBe(0);
      fire(obs, false);
      expect(header).toHaveAttribute('data-scrolled', 'true');
      expect(header).toHaveClass('bg-bg');
      fire(obs, true);
      expect(header).toHaveAttribute('data-scrolled', 'false');
    });

    it('altura fracionária do cabeçalho: margem arredondada para baixo, transparente no topo', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const height = this.tagName === 'HEADER' ? 56.6 : 0;
        return { height, width: 390, top: 0, left: 0, bottom: height, right: 390 } as DOMRect;
      });
      renderAt('/');
      const header = (await screen.findByRole('link', { name: 'Configurações' })).closest(
        'header',
      )!;
      const obs = observers.at(-1)!;
      expect(obs.options?.rootMargin).toBe('-56px 0px 0px 0px');
      fire(obs, true);
      expect(header).toHaveAttribute('data-scrolled', 'false');
      fire(obs, false);
      expect(header).toHaveAttribute('data-scrolled', 'true');
    });

    it('mede de novo ao trocar de breakpoint, mesmo sem mudar a altura do cabeçalho', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const height = this.tagName === 'HEADER' ? 56.6 : 0;
        return { height, width: 390, top: 0, left: 0, bottom: height, right: 390 } as DOMRect;
      });
      renderAt('/');
      await screen.findByRole('link', { name: 'Configurações' });
      expect(observers.at(-1)!.options?.rootMargin).toBe('-56px 0px 0px 0px');
      // ≥ 1024 px: o cabeçalho vira o topo do menu lateral (fixed) e não cobre o conteúdo.
      mediaControl.matches = true;
      act(() => mediaControl.listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent)));
      expect(observers.at(-1)!.options?.rootMargin).toBe('0px 0px 0px 0px');
    });

    it('desconecta o observador ao desmontar', async () => {
      const { unmount } = renderAt('/');
      await screen.findByRole('link', { name: 'Configurações' });
      const obs = observers.at(-1)!;
      unmount();
      expect(obs.disconnect).toHaveBeenCalled();
    });
  });

  it('sem IntersectionObserver o cabeçalho fica com o fundo legível', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    renderAt('/');
    const header = (await screen.findByRole('link', { name: 'Configurações' })).closest('header')!;
    expect(header).toHaveAttribute('data-scrolled', 'true');
    expect(header).toHaveClass('bg-bg');
  });

  it('barra inferior respeita a área segura e o item ativo tem ícone em pílula preenchida', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    const active = screen.getByRole('link', { name: 'Hoje' });
    expect(active.querySelector('[data-nav-icon]')).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByRole('link', { name: 'Registro' }).querySelector('[data-nav-icon]'),
    ).toHaveAttribute('data-active', 'false');
  });

  it('renderiza a rota admin de forma preguiçosa', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: /administração/i })).toBeInTheDocument();
  });
});
