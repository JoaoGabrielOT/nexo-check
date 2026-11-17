import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickAddButton } from '@nexo/ui';
import { MotionProvider } from '../src/app/motion';
import { mediaControl } from './setup';

describe('MotionProvider', () => {
  // Sem reducedMotion="user" o motion ignora a preferência do sistema e o botão encolheria com transform inline.
  it('respeita prefers-reduced-motion: o QuickAddButton não aplica transform ao ser pressionado', async () => {
    mediaControl.matches = true;
    // O motion avisa no console (em dev) quando o movimento reduzido está ativo: aviso esperado aqui.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <MotionProvider>
        <QuickAddButton onClick={() => {}}>+5 min</QuickAddButton>
      </MotionProvider>,
    );
    const btn = screen.getByRole('button', { name: '+5 min' });
    await user.pointer({ keys: '[MouseLeft>]', target: btn });
    await new Promise((r) => setTimeout(r, 100));
    expect(btn.style.transform).toBe('');
    warn.mockRestore();
  });
});
