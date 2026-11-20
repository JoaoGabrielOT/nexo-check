import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../src/app/theme';
import { RouteErrorPage } from '../../src/app/ErrorPages';
import { RootErrorBoundary } from '../../src/app/RootErrorBoundary';
import { routes } from '../../src/app/router';
import { db, updateSettings } from '../../src/db';
import { resetDbForTests } from '../../src/db/db';

beforeEach(async () => {
  await resetDbForTests();
  await updateSettings({ onboardingDone: true });
  // A tela de erro registra no console: o teste só confere o que a pessoa vê.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('erros de rota', () => {
  it('rota inexistente mostra a página 404 própria, com a navegação do app', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/qualquer'] });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '/');
  });

  it('erro ao renderizar uma tela mostra a tela amigável com o botão de voltar', async () => {
    const Boom = () => {
      throw new Error('quebrou');
    };
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <RouteErrorPage /> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
    expect(screen.getByText(/Seus registros continuam salvos/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '/');
  });

  it('falha ao ler as configurações não deixa o app em branco', async () => {
    vi.spyOn(db.settings, 'get').mockRejectedValue(new Error('IndexedDB indisponível'));
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <RootErrorBoundary>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </RootErrorBoundary>,
    );
    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toBeVisible();
  });
});
