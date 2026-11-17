import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentStep } from '../../src/features/onboarding/ConsentStep';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@nexo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nexo/ui')>()),
  toast: toastMock,
}));

beforeEach(() => toastMock.mockClear());

describe('ConsentStep', () => {
  it('mostra um aviso de erro (sem rejeição solta) quando a gravação falha', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn().mockRejectedValue(new Error('disco cheio'));
    render(<ConsentStep reconsent={false} onAccept={onAccept} onDecline={vi.fn()} />);
    await user.click(
      screen.getByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    );
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('Não foi possível concluir agora. Tente novamente.'),
    );
    expect(screen.getByRole('button', { name: 'Usar sem enviar dados' })).toBeEnabled();
  });
});
