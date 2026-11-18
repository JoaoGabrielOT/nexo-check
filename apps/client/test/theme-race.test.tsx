import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../src/app/theme';
import { resetDbForTests } from '../src/db/db';
import { db, defaultSettings } from '../src/db';

type Mode = 'apply' | 'skip' | 'fail';
interface Write {
  patch: { theme?: string };
  finish: (mode: Mode) => void;
}
const gate = vi.hoisted(() => ({
  writes: [] as unknown[],
  getCalls: 0,
  failGet: false,
  toast: vi.fn(),
}));

vi.mock('@nexo/ui', async (orig) => ({ ...(await orig<object>()), toast: gate.toast }));
vi.mock('../src/db', async (orig) => {
  const actual = await orig<typeof import('../src/db')>();
  return {
    ...actual,
    getSettings: vi.fn(async () => {
      gate.getCalls++;
      if (gate.failGet) throw new Error('leitura falhou');
      return actual.getSettings();
    }),
    // Gravação lenta: só conclui quando o teste manda (aplicar, ignorar ou falhar).
    updateSettings: vi.fn(
      (patch: Parameters<typeof actual.updateSettings>[0]) =>
        new Promise<void>((resolve, reject) => {
          const write: Write = {
            patch,
            finish: (mode) => {
              if (mode === 'fail') reject(new Error('falhou'));
              else if (mode === 'skip') resolve();
              else void actual.updateSettings(patch).then(resolve, reject);
            },
          };
          gate.writes.push(write);
        }),
    ),
  };
});

const writes = () => gate.writes as Write[];

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

const putTheme = (theme: 'light' | 'dark' | 'system') =>
  db.settings.put({ key: 'app', value: { ...defaultSettings(), theme } });
const shown = () => screen.getByRole('status');
const click = (name: string) => act(async () => screen.getByText(name).click());

/** Grava no banco e espera a consulta ao vivo reler (a emissão chegou ao provider). */
async function emit(theme: 'light' | 'dark' | 'system') {
  const before = gate.getCalls;
  await act(async () => {
    await putTheme(theme);
    await waitFor(() => expect(gate.getCalls).toBeGreaterThan(before));
  });
}

function mount() {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  gate.writes = [];
  gate.getCalls = 0;
  gate.failGet = false;
  gate.toast.mockClear();
  await resetDbForTests();
});
afterEach(() => document.documentElement.classList.remove('dark'));

describe('corrida do tema', () => {
  it('(a) emissão antiga durante a gravação não reverte a escolha', async () => {
    await putTheme('light');
    mount();
    await waitFor(() => expect(shown()).toHaveTextContent('light'));
    await click('dark');
    expect(shown()).toHaveTextContent('dark');
    await emit('system');
    expect(shown()).toHaveTextContent('dark');
    await act(async () => writes()[0]?.finish('apply'));
    await waitFor(async () => expect((await db.settings.get('app'))?.value.theme).toBe('dark'));
    await waitFor(() => expect(shown()).toHaveTextContent('dark'));
    // Confirmada a escolha, mudanças externas (importar backup) voltam a valer.
    await emit('light');
    await waitFor(() => expect(shown()).toHaveTextContent('light'));
  });

  it('(b) dark e depois light: a primeira gravação terminando por último não vence', async () => {
    await putTheme('system');
    mount();
    await waitFor(() => expect(shown()).toHaveTextContent('system'));
    await click('dark');
    await click('light');
    await act(async () => writes()[1]?.finish('apply'));
    await waitFor(() => expect(shown()).toHaveTextContent('light'));
    await act(async () => writes()[0]?.finish('skip'));
    expect(shown()).toHaveTextContent('light');
    expect(localStorage.getItem('nexo-theme')).toBe('light');
    expect((await db.settings.get('app'))?.value.theme).toBe('light');
  });

  it('(c) gravação e releitura falhando: limpa a pendência, avisa e aceita mudança externa', async () => {
    await putTheme('light');
    mount();
    await waitFor(() => expect(shown()).toHaveTextContent('light'));
    await click('dark');
    expect(shown()).toHaveTextContent('dark');
    gate.failGet = true;
    await act(async () => writes()[0]?.finish('fail'));
    await waitFor(() => expect(gate.toast).toHaveBeenCalledOnce());
    gate.failGet = false;
    expect(shown()).toHaveTextContent('light');
    expect(localStorage.getItem('nexo-theme')).toBe('light');
    await emit('dark');
    await waitFor(() => expect(shown()).toHaveTextContent('dark'));
  });
});
