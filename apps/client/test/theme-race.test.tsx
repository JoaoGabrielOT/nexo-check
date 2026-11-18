import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../src/app/theme';
import { resetDbForTests } from '../src/db/db';
import { db, defaultSettings } from '../src/db';

const gate = vi.hoisted(() => ({ release: null as null | (() => void), fail: false }));

vi.mock('../src/db', async (orig) => {
  const actual = await orig<typeof import('../src/db')>();
  return {
    ...actual,
    // Gravação lenta: só conclui quando o teste libera.
    updateSettings: vi.fn(
      (patch: Parameters<typeof actual.updateSettings>[0]) =>
        new Promise<void>((resolve, reject) => {
          gate.release = () => {
            if (gate.fail) reject(new Error('falhou'));
            else void actual.updateSettings(patch).then(resolve, reject);
          };
        }),
    ),
  };
});

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <output>{theme}</output>
      <button onClick={() => setTheme('dark')}>dark</button>
    </>
  );
}

const putTheme = (theme: 'light' | 'dark' | 'system') =>
  db.settings.put({ key: 'app', value: { ...defaultSettings(), theme } });

beforeEach(async () => {
  gate.release = null;
  gate.fail = false;
  await resetDbForTests();
});
afterEach(() => document.documentElement.classList.remove('dark'));

describe('corrida do tema', () => {
  it('emissões antigas da consulta não revertem a escolha enquanto a gravação não conclui', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => screen.getByText('dark').click());
    expect(screen.getByRole('status')).toHaveTextContent('dark');
    // Emissão antiga/externa com outro valor chega antes da gravação concluir.
    await act(async () => void (await putTheme('light')));
    expect(screen.getByRole('status')).toHaveTextContent('dark');
    await act(async () => gate.release?.());
    await waitFor(async () => expect((await db.settings.get('app'))?.value.theme).toBe('dark'));
    expect(screen.getByRole('status')).toHaveTextContent('dark');
    // Confirmada a escolha, mudanças externas (importar backup) voltam a valer.
    await act(async () => void (await putTheme('light')));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('light'));
  });

  it('falha ao gravar volta ao tema salvo', async () => {
    await putTheme('light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('light'));
    await act(async () => screen.getByText('dark').click());
    gate.fail = true;
    await act(async () => gate.release?.());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('light'));
    expect(localStorage.getItem('nexo-theme')).toBe('light');
  });
});
