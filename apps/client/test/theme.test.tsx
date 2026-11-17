import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../src/app/theme';

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
