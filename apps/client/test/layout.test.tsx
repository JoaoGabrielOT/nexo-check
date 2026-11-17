import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../src/app/theme';
import { routes } from '../src/app/router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

describe('layout', () => {
  it('mostra os 5 itens de navegação com nome acessível', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const name of ['Hoje', 'Registro', 'Progresso', 'Aprender', 'Projeto']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(nav.querySelectorAll('a')).toHaveLength(5);
  });

  it('marca o item ativo com aria-current="page"', () => {
    renderAt('/registro');
    expect(screen.getByRole('link', { name: 'Registro' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('mantém o item ativo em subrotas', () => {
    renderAt('/aprender/guia/respiracao');
    expect(screen.getByRole('link', { name: 'Aprender' })).toHaveAttribute('aria-current', 'page');
  });

  it('tem link para pular ao conteúdo, link de configurações e título da página', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    );
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/config');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
  });

  it('renderiza a rota admin de forma preguiçosa', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: /administração/i })).toBeInTheDocument();
  });
});
