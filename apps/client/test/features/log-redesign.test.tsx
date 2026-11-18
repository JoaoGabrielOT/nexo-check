import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogPage } from '../../src/features/log';
import { getAfterSaveMessage } from '../../src/features/log/afterSave';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import { getDailyLog, type saveDailyLog } from '../../src/db';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@nexo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nexo/ui')>()),
  toast: toastMock,
}));

// getDailyLog passa direto para o banco real, a não ser que o teste troque a implementação.
const loadSpy = vi.hoisted(() => vi.fn());
const saveSpy = vi.hoisted(() =>
  vi.fn<(log: Parameters<typeof saveDailyLog>[0]) => Promise<void>>(),
);
const real = vi.hoisted(() => ({
  save: (() => Promise.reject(new Error('mock não carregado'))) as typeof saveDailyLog,
}));
vi.mock('../../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db')>();
  loadSpy.mockImplementation(actual.getDailyLog);
  saveSpy.mockImplementation(actual.saveDailyLog);
  real.save = actual.saveDailyLog;
  return { ...actual, getDailyLog: loadSpy, saveDailyLog: saveSpy };
});

const group = (name: string) => screen.findByRole('radiogroup', { name });
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string, label: string) =>
  user.click(within(await group(name)).getByRole('radio', { name: label }));
const save = () => screen.getByRole('button', { name: 'Salvar registro' });

beforeEach(async () => {
  await resetDbForTests();
  toastMock.mockClear();
  setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
});

afterEach(() => setNowForTests(null));

describe('getAfterSaveMessage', () => {
  const calm = { stress: 3, mood: 3, energy: 3, sleepQuality: 3 };

  it('estresse alto ou humor baixo: dia difícil', () => {
    expect(getAfterSaveMessage({ ...calm, stress: 4 })).toBe('log.after.hardDay');
    expect(getAfterSaveMessage({ ...calm, mood: 2 })).toBe('log.after.hardDay');
    // Dia difícil tem prioridade sobre disposição alta.
    expect(getAfterSaveMessage({ ...calm, stress: 5, energy: 5 })).toBe('log.after.hardDay');
  });

  it('disposição alta e estresse baixo: dia bom', () => {
    expect(getAfterSaveMessage({ ...calm, energy: 4, stress: 2 })).toBe('log.after.goodDay');
  });

  it('demais casos: neutro', () => {
    expect(getAfterSaveMessage(calm)).toBe('log.after.neutral');
    expect(getAfterSaveMessage({ ...calm, energy: 4, stress: 3 })).toBe('log.after.neutral');
  });
});

describe('Registro redesenhado', () => {
  it('título "Como foi seu dia?" e pílulas com número e palavra', async () => {
    render(<LogPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Como foi seu dia?' }),
    ).toBeInTheDocument();
    expect(
      within(await group('Estresse percebido')).getByRole('radio', { name: '4 — Alto' }),
    ).toBeInTheDocument();
    expect(within(await group('Humor')).getByRole('radio', { name: '3 — Ok' })).toBeInTheDocument();
    expect(
      within(await group('Disposição')).getByRole('radio', { name: '1 — Muito baixa' }),
    ).toBeInTheDocument();
    expect(
      within(await group('Qualidade do sono')).getByRole('radio', { name: '5 — Muito boa' }),
    ).toBeInTheDocument();
  });

  it('depois de salvar, a frase de retorno aparece numa região aria-live educada', async () => {
    const user = userEvent.setup();
    const { container } = render(<LogPage />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toBeEmptyDOMElement();

    await pick(user, 'Estresse percebido', '5 — Muito alto');
    await pick(user, 'Humor', '2 — Mal');
    await pick(user, 'Disposição', '2 — Baixa');
    await pick(user, 'Qualidade do sono', '3 — Regular');
    await user.click(save());

    await waitFor(() => expect(live).toHaveTextContent(/respiração/));
    expect(live).toHaveTextContent(/não substitui/);
    expect(toastMock).toHaveBeenCalledWith('Registro salvo');
  });

  it('a frase de retorno some quando uma resposta ou a anotação muda depois de salvar', async () => {
    const user = userEvent.setup();
    const { container } = render(<LogPage />);
    const live = container.querySelector('[aria-live="polite"]');
    await pick(user, 'Estresse percebido', '2 — Baixo');
    await pick(user, 'Humor', '4 — Bem');
    await pick(user, 'Disposição', '4 — Alta');
    await pick(user, 'Qualidade do sono', '4 — Boa');
    await user.click(save());
    await waitFor(() => expect(live).not.toBeEmptyDOMElement());

    await pick(user, 'Humor', '3 — Ok');
    expect(live).toBeEmptyDOMElement();

    await user.click(save());
    await waitFor(() => expect(live).not.toBeEmptyDOMElement());
    await user.type(screen.getByLabelText('Observação (fica só no seu aparelho)'), 'x');
    expect(live).toBeEmptyDOMElement();
  });

  it('não mostra a frase de retorno se o dia mudou enquanto salvava', async () => {
    const user = userEvent.setup();
    const { container } = render(<LogPage />);
    const live = container.querySelector('[aria-live="polite"]');
    await pick(user, 'Estresse percebido', '2 — Baixo');
    await pick(user, 'Humor', '4 — Bem');
    await pick(user, 'Disposição', '4 — Alta');
    await pick(user, 'Qualidade do sono', '4 — Boa');

    let release: () => void = () => {};
    saveSpy.mockImplementationOnce(
      (log) =>
        new Promise<void>((resolve) => {
          release = () => void real.save(log).then(resolve);
        }),
    );
    await user.click(save());
    await user.selectOptions(screen.getByLabelText('Dia'), '2026-11-12');
    release();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Registro salvo'));
    expect(live).toBeEmptyDOMElement();
  });

  it('salvar fica desabilitado enquanto o dia escolhido carrega', async () => {
    const user = userEvent.setup();
    render(<LogPage />);
    await pick(user, 'Estresse percebido', '2 — Baixo');
    await pick(user, 'Humor', '4 — Bem');
    await pick(user, 'Disposição', '3 — Média');
    await pick(user, 'Qualidade do sono', '4 — Boa');
    expect(save()).toBeEnabled();

    loadSpy.mockImplementationOnce(() => new Promise(() => {}));
    await user.selectOptions(screen.getByLabelText('Dia'), '2026-11-12');
    expect(save()).toBeDisabled();
    expect(await getDailyLog('2026-11-12')).toBeUndefined();
  });

  it('erro ao carregar o dia avisa com um toast', async () => {
    loadSpy.mockImplementationOnce(() => Promise.reject(new Error('falhou')));
    render(<LogPage />);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('Não foi possível concluir agora. Tente novamente.'),
    );
    expect(save()).toBeDisabled();
  });
});
