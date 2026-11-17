import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogPage } from '../../src/features/log';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import { getDailyLog } from '../../src/db';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@nexo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nexo/ui')>()),
  toast: toastMock,
}));

const NOTE = 'Observação (fica só no seu aparelho)';
const group = (name: string) => screen.findByRole('radiogroup', { name });
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string, n: number) =>
  user.click(within(await group(name)).getByRole('radio', { name: String(n) }));
const save = () => screen.getByRole('button', { name: 'Salvar registro' });

beforeEach(async () => {
  await resetDbForTests();
  toastMock.mockClear();
  setNowForTests(() => new Date(2026, 10, 17, 12, 0, 0));
});

afterEach(() => setNowForTests(null));

describe('Registro do dia', () => {
  it('só habilita salvar com as 4 escalas preenchidas', async () => {
    const user = userEvent.setup();
    render(<LogPage />);
    await pick(user, 'Estresse percebido', 2);
    await pick(user, 'Humor', 4);
    await pick(user, 'Disposição', 3);
    expect(save()).toBeDisabled();
    await pick(user, 'Qualidade do sono', 5);
    expect(save()).toBeEnabled();
  });

  it('salva, avisa e reabre mostrando os valores e a observação', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LogPage />);
    await pick(user, 'Estresse percebido', 2);
    await pick(user, 'Humor', 4);
    await pick(user, 'Disposição', 3);
    await pick(user, 'Qualidade do sono', 5);
    await user.type(screen.getByLabelText(NOTE), 'dia tranquilo');
    await user.click(save());

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Registro salvo'));
    expect(await getDailyLog('2026-11-17')).toMatchObject({
      stress: 2,
      mood: 4,
      energy: 3,
      sleepQuality: 5,
      note: 'dia tranquilo',
    });
    unmount();

    render(<LogPage />);
    const stress = await group('Estresse percebido');
    await waitFor(() =>
      expect(within(stress).getByRole('radio', { name: '2' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(
      within(await group('Qualidade do sono')).getByRole('radio', { name: '5' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(NOTE)).toHaveValue('dia tranquilo');
  });

  it('permite editar um dos 7 últimos dias pelo seletor Dia', async () => {
    const user = userEvent.setup();
    render(<LogPage />);
    const select = await screen.findByLabelText('Dia');
    expect(within(select).getAllByRole('option')).toHaveLength(7);
    await user.selectOptions(select, '2026-11-12');
    await pick(user, 'Estresse percebido', 1);
    await pick(user, 'Humor', 1);
    await pick(user, 'Disposição', 1);
    await pick(user, 'Qualidade do sono', 1);
    await user.click(save());
    await waitFor(async () => expect((await getDailyLog('2026-11-12'))?.stress).toBe(1));
    expect(await getDailyLog('2026-11-17')).toBeUndefined();
  });
});
