import { useState, type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import {
  PageHeader,
  ProgressRing,
  QuickAddButton,
  ScalePills,
  Tile,
  Wallpaper,
  type ScaleValue,
} from '../src';

// Razão de contraste WCAG 2.x entre duas cores #rrggbb.
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrastRatio(hexA: string, hexB: string): number {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Cor resultante de `top` com opacidade `alpha` sobre `base` (composição normal).
function over(top: string, alpha: number, base: string): string {
  const a = Number.parseInt(top.slice(1), 16);
  const b = Number.parseInt(base.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`;
}

const DARK = {
  bg: '#16141a',
  surface: '#211e26',
  text: '#f3f0f5',
  muted: '#bdb6c6',
  labels: ['#9cc6e6', '#f7b866', '#eba0a3', '#cfcbe3', '#bdb6c6'],
};
const NAVY = '#1d1a5c';
const AA = 4.5;

describe('contraste dos tokens', () => {
  it('confere a função com valores conhecidos', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it.each([DARK.bg, DARK.surface])('texto e secundário do escuro sobre %s passam AA', (bg) => {
    expect(contrastRatio(DARK.text, bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(DARK.muted, bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(['#f5a64a', '#c9c6dc', '#fbe3c4', '#d6e7f4', '#efe9f6', '#f3c79a'])(
    'navy sobre %s passa AA',
    (bg) => {
      expect(contrastRatio(NAVY, bg)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(DARK.labels)('rótulo colorido %s passa AA sobre a superfície escura', (label) => {
    expect(contrastRatio(label, DARK.surface)).toBeGreaterThanOrEqual(AA);
  });

  // Pior caso do wallpaper: o centro da mancha laranja (22%) com o bloco translúcido (6%) por cima.
  it('texto secundário e rótulos continuam AA sobre o bloco em cima da mancha mais forte', () => {
    const tile = over('#ffffff', 0.06, over('#f5a64a', 0.22, DARK.bg));
    for (const fg of [DARK.text, DARK.muted, ...DARK.labels]) {
      expect(contrastRatio(fg, tile)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('borda de controle do escuro tem 3:1 sobre fundo e superfície', () => {
    for (const bg of [DARK.bg, DARK.surface]) {
      expect(contrastRatio('#8a8394', bg)).toBeGreaterThanOrEqual(3);
    }
  });

  // ScalePills: pílula mais forte de cada tema (lavanda #a8a4c2 no claro, pêssego 40% no escuro).
  it('números das pílulas da escala passam AA no tom mais forte', () => {
    expect(contrastRatio(NAVY, '#a8a4c2')).toBeGreaterThanOrEqual(AA);
    for (const bg of [DARK.bg, DARK.surface]) {
      expect(contrastRatio(DARK.text, over('#f3c79a', 0.4, bg))).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('Tile', () => {
  it('é uma seção rotulada com a classe do tom', () => {
    render(
      <Tile tone="water" label="Água">
        3 de 8 copos
      </Tile>,
    );
    const tile = screen.getByRole('region', { name: 'Água' });
    expect(tile.tagName).toBe('SECTION');
    expect(tile).toHaveClass('bg-tile-water', 'rounded-tile');
    expect(tile).toHaveTextContent('3 de 8 copos');
  });

  it('aceita className do consumidor sem perder o raio', () => {
    render(
      <Tile tone="plain" label="Mobilidade" className="col-span-2 rounded-hero">
        ok
      </Tile>,
    );
    const tile = screen.getByRole('region', { name: 'Mobilidade' });
    expect(tile).toHaveClass('bg-tile-plain', 'col-span-2', 'rounded-hero');
    expect(tile).not.toHaveClass('rounded-tile');
  });
});

describe('ProgressRing', () => {
  it('expõe uma imagem com nome acessível e arco proporcional ao valor', () => {
    const { container } = render(<ProgressRing value={0.66} label="4 de 6 hábitos feitos" />);
    expect(screen.getByRole('img', { name: '4 de 6 hábitos feitos' })).toBeInTheDocument();
    const arc = container.querySelector('[data-ring="value"]');
    const r = Number(arc?.getAttribute('r'));
    const length = 2 * Math.PI * r;
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBeCloseTo(length * 0.34, 2);
  });

  it('limita o valor entre 0 e 1', () => {
    const { container } = render(<ProgressRing value={1.7} label="Completo" />);
    const arc = container.querySelector('[data-ring="value"]');
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBe(0);
  });
});

describe('ScalePills', () => {
  const words = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'] as [
    string,
    string,
    string,
    string,
    string,
  ];

  function Harness({ initial = null }: { initial?: ScaleValue | null }) {
    const [value, setValue] = useState<ScaleValue | null>(initial);
    return <ScalePills label="Energia" words={words} value={value} onChange={setValue} />;
  }

  it('é um radiogroup rotulado com cinco opções nomeadas por número e palavra', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Energia' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios[2]).toHaveAccessibleName('3 — Médio');
    // Sem valor, só a primeira opção entra na ordem de tabulação.
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('setas mudam a seleção e o foco, e anunciam "4 — Alto"', async () => {
    const user = userEvent.setup();
    render(<Harness initial={3} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: '3 — Médio' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const four = screen.getByRole('radio', { name: '4 — Alto' });
    expect(four).toHaveFocus();
    expect(four).toBeChecked();
    expect(screen.getByRole('radio', { name: '3 — Médio' })).not.toBeChecked();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '2 — Baixo' })).toBeChecked();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: '5 — Muito alto' })).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '1 — Muito baixo' })).toBeChecked();
  });

  it('clicar seleciona a opção', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: '5 — Muito alto' }));
    expect(screen.getByRole('radio', { name: '5 — Muito alto' })).toBeChecked();
  });
});

describe('Wallpaper', () => {
  it('fica escondido de leitores de tela e não captura cliques', () => {
    const { container } = render(<Wallpaper />);
    const layer = container.firstElementChild;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass('pointer-events-none', 'fixed', 'z-0');
  });
});

describe('PageHeader', () => {
  it('mostra o título como h1 com rótulo, linha de apoio e lateral', () => {
    render(
      <PageHeader
        eyebrow="Hoje"
        title="Terça, 17 de novembro"
        meta="4 de 6 hábitos"
        aside={<span>anel</span>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Terça, 17 de novembro' })).toBeVisible();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('4 de 6 hábitos')).toBeInTheDocument();
    expect(screen.getByText('anel')).toBeInTheDocument();
  });
});

describe('QuickAddButton', () => {
  async function pressAndRead(ui: ReactElement) {
    const user = userEvent.setup();
    render(ui);
    const btn = screen.getByRole('button', { name: '+10 min' });
    await user.pointer({ keys: '[MouseLeft>]', target: btn });
    return btn;
  }

  it('é uma pílula com alvo de 44 px', () => {
    render(<QuickAddButton onClick={() => {}}>+10 min</QuickAddButton>);
    const btn = screen.getByRole('button', { name: '+10 min' });
    expect(btn).toHaveClass('min-h-11', 'rounded-full');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('chama onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<QuickAddButton onClick={onClick}>+10 min</QuickAddButton>);
    await user.click(screen.getByRole('button', { name: '+10 min' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('encolhe com mola ao pressionar', async () => {
    const btn = await pressAndRead(
      <LazyMotion features={domAnimation}>
        <QuickAddButton onClick={() => {}}>+10 min</QuickAddButton>
      </LazyMotion>,
    );
    await waitFor(() => expect(btn.style.transform).toMatch(/scale/));
  });

  it('com movimento reduzido não aplica transform', async () => {
    // O motion avisa no console (em dev) quando o movimento reduzido está ativo: aviso esperado aqui.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const btn = await pressAndRead(
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion="always">
          <QuickAddButton onClick={() => {}}>+10 min</QuickAddButton>
        </MotionConfig>
      </LazyMotion>,
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(btn.style.transform).toBe('');
    warn.mockRestore();
  });
});
