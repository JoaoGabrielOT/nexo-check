/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nas listas */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, RouterProvider, Routes, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuestionnaire } from '@nexo/shared';
import { routes } from '../../src/app/router';
import { ThemeProvider } from '../../src/app/theme';
import { safeNext } from '../../src/lib/nextPath';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import { db, saveQuestionnaireResponse, updateSettings } from '../../src/db';
import { CheckinPage } from '../../src/features/checkin';
import { ProjectPage, QuestionnairePage } from '../../src/features/project';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projeto" element={<ProjectPage />} />
        <Route path="/projeto/questionario/:kind" element={<QuestionnairePage />} />
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/onboarding/consentimento" element={<p>tela de consentimento</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CONSENT = { granted: true, version: 1, at: '2026-11-18T10:00:00.000Z' } as const;

function mk(
  id: string,
  sessionCode: string,
  status: 'pending' | 'confirmed' | 'rejected',
  reason: 'invalid_code' | 'expired' | null,
  createdAt: string,
) {
  return { id, sessionCode, createdAt, status, reason, workshop: null, date: null, syncedAt: null };
}

beforeEach(async () => {
  setNowForTests(() => new Date(2026, 10, 18, 10, 0, 0));
  await resetDbForTests();
});

describe('Questionário educativo', () => {
  it('8 de 10 certas mostra 80% e grava score 0,8', async () => {
    const user = userEvent.setup();
    const def = getQuestionnaire('educativo');
    renderAt('/projeto/questionario/educativo');
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    for (const [i, q] of def.questions.entries()) {
      expect(screen.getByText(`${i + 1} de ${def.questions.length}`)).toBeVisible();
      const wrong = i >= 8;
      const opt = q.options!.find((o) => (o.value === q.correct) !== wrong)!;
      expect(screen.getByRole('button', { name: 'Avançar' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await user.click(screen.getByRole('radio', { name: opt.label }));
      await user.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    await user.click(screen.getByRole('button', { name: 'Salvar respostas' }));
    expect(await screen.findByText('80%')).toBeVisible();
    const [saved] = await db.questionnaireResponses.toArray();
    expect(saved).toMatchObject({
      kind: 'educativo',
      version: def.version,
      score: 0.8,
      syncedAt: null,
    });
    expect(saved!.id).toBeTruthy();
    expect(Object.keys(saved!.answers)).toHaveLength(def.questions.length);
  });

  it('opções navegam por teclado com as setas', async () => {
    const user = userEvent.setup();
    const def = getQuestionnaire('educativo');
    renderAt('/projeto/questionario/educativo');
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    const radios = screen.getAllByRole('radio');
    radios[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(radios[0]).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: def.questions[0]!.label })).toBeVisible();
  });

  async function answerAll() {
    const user = userEvent.setup();
    const def = getQuestionnaire('educativo');
    renderAt('/projeto/questionario/educativo');
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    for (const q of def.questions) {
      await user.click(screen.getByRole('radio', { name: q.options![0]!.label }));
      await user.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    return { user, def };
  }

  it('salvar duas vezes seguidas grava uma linha só', async () => {
    await answerAll();
    const save = screen.getByRole('button', { name: 'Salvar respostas' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(await screen.findByText(/Respondido em/)).toBeVisible();
    expect(await db.questionnaireResponses.count()).toBe(1);
  });

  it('falha ao salvar mostra o erro e deixa tentar de novo com o mesmo id', async () => {
    const { user } = await answerAll();
    const put = vi.spyOn(db.questionnaireResponses, 'put').mockRejectedValueOnce(new Error('x'));
    await user.click(screen.getByRole('button', { name: 'Salvar respostas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível salvar/);
    expect(await db.questionnaireResponses.count()).toBe(0);
    const failedId = (put.mock.calls[0]![0] as { id: string }).id;
    await user.click(screen.getByRole('button', { name: 'Salvar respostas' }));
    expect(await screen.findByText(/Respondido em/)).toBeVisible();
    const [row] = await db.questionnaireResponses.toArray();
    expect(row!.id).toBe(failedId);
    put.mockRestore();
  });

  it('o foco vai para a pergunta ao avançar e há aviso para leitor de tela', async () => {
    const user = userEvent.setup();
    const def = getQuestionnaire('educativo');
    renderAt('/projeto/questionario/educativo');
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    expect(screen.getByRole('heading', { level: 2, name: def.questions[0]!.label })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(`Pergunta 1 de ${def.questions.length}`);
    expect(screen.getByText('Responda para poder avançar.')).toBeVisible();
  });

  it('mostra o selo Rascunho quando o questionário é rascunho', async () => {
    renderAt('/projeto/questionario/educativo');
    expect(await screen.findByText('Rascunho')).toBeVisible();
  });
});

describe('Campo numérico', () => {
  async function openInitial() {
    const user = userEvent.setup();
    renderAt('/projeto/questionario/inicial');
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    return user;
  }
  const next = () => screen.getByRole('button', { name: 'Avançar' });

  it('limita ao máximo ao sair do campo', async () => {
    const user = await openInitial();
    const input = screen.getByRole('textbox', { name: 'Valor em dias' });
    await user.type(input, '9');
    expect(next()).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(input).toHaveValue('7');
    expect(next()).toHaveAttribute('aria-disabled', 'false');
  });

  it('aceita vírgula decimal e recusa texto que não é número', async () => {
    const user = await openInitial();
    await user.type(screen.getByRole('textbox', { name: 'Valor em dias' }), '3');
    await user.click(next());
    const hours = screen.getByRole('textbox', { name: 'Valor em horas' });
    await user.type(hours, '7,5');
    expect(next()).toHaveAttribute('aria-disabled', 'false');
    await user.clear(hours);
    await user.type(hours, 'abc');
    expect(next()).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(hours).toHaveValue('');
  });
});

describe('Questionário final', () => {
  it('fica bloqueado sem o inicial respondido', async () => {
    renderAt('/projeto/questionario/final');
    expect(await screen.findByText(/responda o questionário inicial/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Começar' })).toBeNull();
  });

  it('libera depois do inicial', async () => {
    await saveQuestionnaireResponse({
      id: 'r1',
      kind: 'inicial',
      version: 1,
      answers: {},
      score: null,
      submittedAt: '2026-11-10T10:00:00.000Z',
    });
    renderAt('/projeto/questionario/final');
    expect(await screen.findByRole('button', { name: 'Começar' })).toBeVisible();
  });
});

describe('Projeto', () => {
  it('destaca o questionário inicial e mostra os estados', async () => {
    renderAt('/projeto');
    expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeVisible();
    const hero = await screen.findByRole('region', { name: 'Próximo passo' });
    expect(within(hero).getByRole('link', { name: /Responder/ })).toHaveAttribute(
      'href',
      '/projeto/questionario/inicial',
    );
    expect(screen.getAllByText('Pendente').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: /Base científica/ })).toHaveLength(2);
  });

  it('mostra data de resposta e nota do educativo', async () => {
    await saveQuestionnaireResponse({
      id: 'r1',
      kind: 'inicial',
      version: 1,
      answers: {},
      score: null,
      submittedAt: new Date(2026, 10, 12, 9).toISOString(),
    });
    await saveQuestionnaireResponse({
      id: 'r2',
      kind: 'educativo',
      version: 1,
      answers: {},
      score: 0.8,
      submittedAt: new Date(2026, 10, 13, 9).toISOString(),
    });
    renderAt('/projeto');
    expect(await screen.findByText('Respondido em 12/11')).toBeVisible();
    expect(screen.getByText('Respondido em 13/11')).toBeVisible();
    expect(screen.getByText('Nota: 80%')).toBeVisible();
  });
});

describe('Check-in', () => {
  it('?c=abc234 pré-preenche e só grava ao confirmar', async () => {
    const user = userEvent.setup();
    await updateSettings({ consent: CONSENT });
    renderAt('/checkin?c=abc234');
    const input = await screen.findByLabelText('Código da oficina');
    expect(input).toHaveValue('ABC234');
    expect(await db.checkins.count()).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Confirmar presença' }));
    await waitFor(async () => expect(await db.checkins.count()).toBe(1));
    const [c] = await db.checkins.toArray();
    expect(c).toMatchObject({ sessionCode: 'ABC234', status: 'pending', syncedAt: null });
    expect(await screen.findByText(/será confirmado quando sincronizar/)).toBeVisible();
  });

  it('converte para maiúsculas ao digitar e recusa caracteres ambíguos', async () => {
    const user = userEvent.setup();
    await updateSettings({ consent: CONSENT });
    renderAt('/checkin');
    const input = await screen.findByLabelText('Código da oficina');
    await user.type(input, 'ab0c23');
    expect(input).toHaveValue('AB0C23');
    await user.click(screen.getByRole('button', { name: 'Confirmar presença' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/código/i);
    expect(await db.checkins.count()).toBe(0);
  });

  it('toque duplo em Confirmar presença grava um check-in só', async () => {
    await updateSettings({ consent: CONSENT });
    renderAt('/checkin?c=ABC234');
    const btn = await screen.findByRole('button', { name: 'Confirmar presença' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(async () => expect(await db.checkins.count()).toBe(1));
    expect(await screen.findByText(/será confirmado quando sincronizar/)).toBeVisible();
  });

  it('código já registrado mostra aviso e não duplica', async () => {
    const user = userEvent.setup();
    await updateSettings({ consent: CONSENT });
    await db.checkins.put(mk('a', 'ABC234', 'pending', null, '2026-11-18T10:00:00.000Z'));
    renderAt('/checkin?c=ABC234');
    await user.click(await screen.findByRole('button', { name: 'Confirmar presença' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você já registrou esse código');
    expect(await db.checkins.count()).toBe(1);
  });

  it('sem consentimento explica e não grava', async () => {
    const user = userEvent.setup();
    renderAt('/checkin?c=ABC234');
    expect(await screen.findByText(/só conta com a participação na pesquisa/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmar presença' })).toBeNull();
    await user.click(screen.getByRole('link', { name: /consentimento/i }));
    expect(await screen.findByText('tela de consentimento')).toBeVisible();
    expect(await db.checkins.count()).toBe(0);
  });

  it('lista check-ins com estado e motivo', async () => {
    await updateSettings({ consent: CONSENT });
    await db.checkins.bulkPut([
      mk('a', 'ABC234', 'confirmed', null, '2026-11-18T10:00:00.000Z'),
      mk('b', 'ZZZ999', 'rejected', 'invalid_code', '2026-11-17T10:00:00.000Z'),
      mk('c', 'MMM222', 'rejected', 'expired', '2026-11-16T10:00:00.000Z'),
    ]);
    renderAt('/projeto');
    expect(await screen.findByText('Confirmado')).toBeVisible();
    expect(screen.getAllByText(/Não confirmado/)).toHaveLength(2);
    expect(screen.getByText(/código inválido/)).toBeVisible();
    expect(screen.getByText(/código expirado/)).toBeVisible();
  });
});

describe('Check-in sem consentimento: volta para o QR depois de consentir', () => {
  it('/checkin?c=ABC234 -> consentimento -> /checkin com o código preenchido', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ['/checkin?c=ABC234'] });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
    await user.click(await screen.findByRole('link', { name: /consentimento/i }));
    expect(router.state.location.search).toContain('next=');
    await user.click(
      await screen.findByRole('button', { name: 'Concordo e quero participar da pesquisa' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    expect(await screen.findByLabelText('Código da oficina')).toHaveValue('ABC234');
    expect(router.state.location.pathname).toBe('/checkin');
    expect(router.state.location.search).toBe('?c=ABC234');
  });

  it('ignora destinos externos em next', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(String.raw`/\evil.com`)).toBe('/');
    expect(safeNext('/checkin?c=ABC234')).toBe('/checkin?c=ABC234');
    expect(safeNext(null)).toBe('/');
  });
});
