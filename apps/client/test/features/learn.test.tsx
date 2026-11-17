import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ArticlePage, LearnPage } from '../../src/features/learn';

function articleAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/aprender/:section/:slug" element={<ArticlePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Aprender', () => {
  it('mostra 5 cards de mecanismos fechados e abre ao clicar', async () => {
    const user = userEvent.setup();
    render(<LearnPage />, { wrapper: MemoryRouter });
    const cards = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    expect(cards).toHaveLength(5);
    cards.forEach((c) => expect(c).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByText(/região do cérebro envolvida/)).not.toBeVisible();
    const hippo = screen.getByRole('button', { name: /Hipocampo/ });
    await user.click(hippo);
    expect(hippo).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/região do cérebro envolvida/)).toBeVisible();
    expect(cards[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('mantém a ressalva científica sempre visível', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    const note = screen.getByRole('note');
    expect(within(note).getByRole('heading', { name: 'Ressalva científica' })).toBeVisible();
    expect(note).toHaveTextContent('não comprova neurogênese');
  });

  it('lista o guia com selo Rascunho, referências e avisos', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Pausas ativas' })).toHaveAttribute(
      'href',
      '/aprender/guia/pausas-ativas',
    );
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Referências' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Avisos' })).toBeVisible();
    expect(screen.getByText(/não substitui acompanhamento/i)).toBeVisible();
  });

  it('links do guia têm área de toque de 44 px', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Pausas ativas' })).toHaveClass('min-h-11');
  });
});

describe('Página de conteúdo', () => {
  it('guia em rascunho mostra o selo, o corpo e o link de volta', () => {
    articleAt('/aprender/guia/caminhada');
    expect(screen.getByRole('heading', { level: 1, name: /Caminhada/ })).toBeVisible();
    expect(screen.getByText('Rascunho')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Aprender' })).toBeVisible();
  });

  it('slug desconhecido mostra mensagem amigável', () => {
    articleAt('/aprender/guia/nao-existe');
    expect(screen.getByRole('heading', { name: 'Conteúdo não encontrado' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Aprender' })).toBeVisible();
  });
});
