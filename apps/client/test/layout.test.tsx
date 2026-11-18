/* eslint-disable @typescript-eslint/no-non-null-assertion -- o link sempre está no header */
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resetDbForTests } from '../src/db/db';
import { updateSettings } from '../src/db';
import { ThemeProvider } from '../src/app/theme';
import { routes } from '../src/app/router';

beforeEach(async () => {
  await resetDbForTests();
  await updateSettings({ onboardingDone: true });
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

describe('layout', () => {
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

  it('cabeçalho transparente ganha fundo assim que o sentinela do topo sai da tela', async () => {
    const observers: { cb: IntersectionObserverCallback; target?: Element; disconnect: Mock }[] =
      [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        constructor(public cb: IntersectionObserverCallback) {
          observers.push(this as unknown as (typeof observers)[number]);
        }
        observe(target: Element) {
          (this as unknown as (typeof observers)[number]).target = target;
        }
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
    renderAt('/');
    const header = (await screen.findByRole('link', { name: 'Configurações' })).closest('header')!;
    expect(header).toHaveAttribute('data-scrolled', 'false');
    expect(header.className).not.toMatch(/(^|\s)bg-bg(\s|$)/);
    const obs = observers.at(-1)!;
    // O sentinela é o primeiro filho do main, com 1 px, antes do conteúdo da página.
    expect(obs.target).toBe(screen.getByRole('main').firstElementChild);
    // Inteiramente visível (razão 1) só no topo; ao rolar, a razão cai abaixo de 1.
    const fire = (atTop: boolean) =>
      act(() =>
        obs.cb(
          [
            {
              isIntersecting: atTop,
              intersectionRatio: atTop ? 1 : 0,
            } as IntersectionObserverEntry,
          ],
          obs as unknown as IntersectionObserver,
        ),
      );
    fire(false);
    expect(header).toHaveAttribute('data-scrolled', 'true');
    expect(header).toHaveClass('bg-bg');
    fire(true);
    expect(header).toHaveAttribute('data-scrolled', 'false');
    vi.unstubAllGlobals();
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
