/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conhecidos nas listas */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { getQuestionnaire } from '@nexo/shared';
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
      expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();
      await user.click(screen.getByRole('radio', { name: opt.label }));
      await user.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));
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

  it('mostra o selo Rascunho quando o questionário é rascunho', async () => {
    renderAt('/projeto/questionario/educativo');
    expect(await screen.findByText('Rascunho')).toBeVisible();
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
