import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
    // em light não há listener; religa em system e confirma remoção no unmount
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
