import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('renderiza a rota admin de forma preguiçosa', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: /administração/i })).toBeInTheDocument();
  });
});
