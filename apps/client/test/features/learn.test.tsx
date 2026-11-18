/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nas listas */
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

  it('cabeçalho com rótulo e destaque das evidências', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { level: 1, name: 'Aprender' })).toBeVisible();
    expect(screen.getByText('Neurociência do exercício')).toBeVisible();
    const hero = screen.getByRole('region', { name: 'O que dizem as evidências' });
    expect(hero).toHaveTextContent('Huang et al. (2024)');
  });

  it('mecanismos em lista numerada de 01 a 05, cada item com seu botão de expandir', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    const list = screen.getByRole('list', { name: 'Mecanismos' });
    // role="list" explícito: o Safari tira a semântica de listas sem marcador.
    expect(list).toHaveAttribute('role', 'list');
    expect(screen.getByRole('list', { name: 'Guia digital' })).toHaveAttribute('role', 'list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    ['01', '02', '03', '04', '05'].forEach((n, i) => {
      expect(within(items[i]!).getByText(n)).toBeVisible();
      expect(within(items[i]!).getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });
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

  it('guia em blocos coloridos que alternam as tintas e cobrem o bloco inteiro com o link', () => {
    render(<LearnPage />, { wrapper: MemoryRouter });
    const list = screen.getByRole('list', { name: 'Guia digital' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(4);
    ['bg-tile-water', 'bg-tile-sleep', 'bg-tile-breaks', 'bg-tile-breathing'].forEach((tone, i) =>
      expect(items[i]).toHaveClass(tone),
    );
    // Link "esticado": o pseudo-elemento cobre o bloco, o nome acessível continua só o título.
    expect(within(items[0]!).getByRole('link')).toHaveClass('after:absolute', 'after:inset-0');
    expect(items[0]).toHaveClass('relative');
    // Foco no bloco via :has(); sem :has() o próprio link mostra o contorno (ver index.css).
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('data-guide-link');
  });
});

describe('Página de conteúdo', () => {
  it('guia em rascunho mostra o selo, o corpo e o link de volta', () => {
    articleAt('/aprender/guia/caminhada');
    expect(screen.getByRole('heading', { level: 1, name: 'Caminhada' })).toBeVisible();
    expect(screen.getByText('Guia digital')).toBeVisible();
    expect(screen.getByText('Rascunho')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Aprender' })).toBeVisible();
  });

  it('slug desconhecido mostra mensagem amigável', () => {
    articleAt('/aprender/guia/nao-existe');
    expect(screen.getByRole('heading', { name: 'Conteúdo não encontrado' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Aprender' })).toBeVisible();
  });
});
