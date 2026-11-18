import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../src/app/theme';
import { mediaControl } from './setup';

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <output>{theme}</output>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
    </>
  );
}

afterEach(() => document.documentElement.classList.remove('dark'));

describe('useTheme', () => {
  it('começa em system e aplica/remove a classe dark no <html>', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('system');
    expect(document.documentElement).not.toHaveClass('dark');
    act(() => screen.getByText('dark').click());
    expect(document.documentElement).toHaveClass('dark');
    act(() => screen.getByText('light').click());
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('useTheme com system', () => {
  it('segue prefers-color-scheme e reage à mudança', () => {
    mediaControl.matches = true;
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement).toHaveClass('dark');
    const [listener] = [...mediaControl.listeners];
    expect(listener).toBeDefined();
    mediaControl.matches = false;
    act(() => listener?.({ matches: false } as MediaQueryListEvent));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('remove o listener ao trocar de tema e ao desmontar', () => {
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const [listener] = [...mediaControl.listeners];
    act(() => screen.getByText('light').click());
    expect(mediaControl.remove).toHaveBeenCalledWith('change', listener);
    mediaControl.remove.mockClear();
    unmount();
    // em light não há listener; religa em system (sem o espelho) e confirma remoção no unmount
    localStorage.clear();
    const second = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const [l2] = [...mediaControl.listeners];
    second.unmount();
    expect(mediaControl.remove).toHaveBeenCalledWith('change', l2);
  });
});

describe('persistência do tema', () => {
  it('começa pelo espelho do localStorage, sem esperar o banco', () => {
    localStorage.setItem('nexo-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('ignora espelho inválido e armazenamento bloqueado', () => {
    localStorage.setItem('nexo-theme', 'roxo');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('system');
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('system');
    vi.restoreAllMocks();
  });
});

describe('theme-color', () => {
  const metas = () =>
    [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (m) => m.content,
    );

  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)" />' +
      '<meta name="theme-color" content="#16141a" media="(prefers-color-scheme: dark)" />';
  });
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('segue o sistema pelas duas metas e usa a cor do tema escolhido quando forçado', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(metas()).toEqual(['#f7f5f2', '#16141a']);
    act(() => screen.getByText('dark').click());
    expect(metas()).toEqual(['#16141a', '#16141a']);
    act(() => screen.getByText('light').click());
    expect(metas()).toEqual(['#f7f5f2', '#f7f5f2']);
  });

  it('devolve as cores originais das metas ao desmontar com tema forçado', () => {
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByText('dark').click());
    expect(metas()).toEqual(['#16141a', '#16141a']);
    unmount();
    expect(metas()).toEqual(['#f7f5f2', '#16141a']);
  });

  it('volta às cores de cada esquema ao voltar para system', () => {
    function Back() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme('system')}>system</button>;
    }
    render(
      <ThemeProvider>
        <Probe />
        <Back />
      </ThemeProvider>,
    );
    act(() => screen.getByText('dark').click());
    act(() => screen.getByText('system').click());
    expect(metas()).toEqual(['#f7f5f2', '#16141a']);
  });
});
