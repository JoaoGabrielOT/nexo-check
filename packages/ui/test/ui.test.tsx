import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert, Button, DecorativePills, ScalePicker, type ScaleValue } from '../src';

describe('Button', () => {
  it('é pílula e tem alvo de toque de 44px', () => {
    render(<Button>Salvar</Button>);
    const btn = screen.getByRole('button', { name: 'Salvar' });
    expect(btn).toHaveClass('rounded-full');
    expect(btn).toHaveClass('min-h-11');
  });
});

describe('Alert', () => {
  it('tem role="note"', () => {
    render(<Alert>Este app não substitui o cuidado profissional.</Alert>);
    expect(screen.getByRole('note')).toHaveTextContent('não substitui');
  });
});

describe('DecorativePills', () => {
  it('fica escondido de leitores de tela', () => {
    const { container } = render(<DecorativePills />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ScalePicker', () => {
  function Harness({ onChange }: { onChange: (v: ScaleValue) => void }) {
    const [value, setValue] = useState<ScaleValue | null>(2);
    return (
      <ScalePicker
        label="Como você está?"
        lowLabel="Muito mal"
        highLabel="Muito bem"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it('expõe um radiogroup rotulado com 5 opções', () => {
    render(<Harness onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Como você está?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByText('Muito mal')).toBeInTheDocument();
  });

  it('seta para a direita muda o valor para 3 e chama onChange(3)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '2' }));
    // O Radix move o foco após o keydown e só marca a opção se a seta ainda estiver pressionada.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(3));
    await user.keyboard('{/ArrowRight}');
    expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
  });
});
