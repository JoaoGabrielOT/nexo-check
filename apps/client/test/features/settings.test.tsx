import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../src/app/theme';
import { setNowForTests } from '../../src/db/clock';
import { resetDbForTests } from '../../src/db/db';
import {
  db,
  ensureDefaultHabits,
  exportAll,
  getEntriesForDate,
  getHabits,
  getSettings,
  saveDailyLog,
  setEntry,
  updateSettings,
} from '../../src/db';
import { ConfigPage } from '../../src/features/settings/ConfigPage';
import { TodayPage } from '../../src/features/today';
import * as files from '../../src/platform/files';
import { setUpdaterAdapterForTests } from '../../src/platform/updater/store';
import * as ui from '@nexo/ui';

vi.mock('@nexo/ui', async (orig) => {
  const m = await orig<typeof import('@nexo/ui')>();
  return { ...m, toast: vi.fn(m.toast) };
});

vi.mock('../../src/platform/files', () => ({
  downloadFile: vi.fn(),
  pickFile: vi.fn(),
}));

const TODAY = '2026-11-18';

function renderConfig(deleteRemote?: () => Promise<void>) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/config']}>
        <Routes>
          <Route path="/config" element={<ConfigPage deleteRemote={deleteRemote} />} />
          <Route path="/onboarding" element={<p>tela de boas-vindas</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  setNowForTests(() => new Date(2026, 10, 18, 10, 0, 0));
  await resetDbForTests();
  await ensureDefaultHabits(new Date());
  await updateSettings({ onboardingDone: true });
  vi.mocked(files.downloadFile).mockReset();
  vi.mocked(files.pickFile).mockReset();
});

afterEach(() => setNowForTests(null));

describe('editor de hábitos', () => {
  it('desativar Hidratação remove a linha da tela Hoje', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('switch', { name: 'Ativar Hidratação' }));
    await waitFor(async () =>
      expect((await getHabits()).find((h) => h.key === 'hydration')?.active).toBe(false),
    );
    cleanup();
    render(<TodayPage />);
    expect(await screen.findByRole('region', { name: 'Movimento do dia' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Hidratação' })).not.toBeInTheDocument();
  });

  it('criar hábito próprio "Leitura" (sim ou não) aparece em Hoje', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.type(await screen.findByLabelText('Nome do hábito'), 'Leitura');
    await user.click(screen.getByRole('button', { name: 'Adicionar hábito' }));
    await waitFor(async () => expect((await getHabits()).map((h) => h.name)).toContain('Leitura'));
    const created = (await getHabits()).find((h) => h.name === 'Leitura');
    expect(created).toMatchObject({ key: null, type: 'boolean', target: 1, active: true });
    cleanup();
    render(<TodayPage />);
    expect(await screen.findByRole('region', { name: 'Leitura' })).toBeInTheDocument();
  });

  it('nome do hábito novo é limitado a 40 caracteres', async () => {
    renderConfig();
    expect(await screen.findByLabelText('Nome do hábito')).toHaveAttribute('maxlength', '40');
    expect(screen.getByText(/o nome é enviado. Evite dados pessoais/)).toBeInTheDocument();
  });

  it('só hábitos próprios têm botão de excluir; excluir pede confirmação', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.type(await screen.findByLabelText('Nome do hábito'), 'Leitura');
    await user.click(screen.getByRole('button', { name: 'Adicionar hábito' }));
    expect(await screen.findByRole('button', { name: 'Excluir Leitura' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Hidratação' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Excluir Leitura' }));
    const dialog = await screen.findByRole('dialog');
    expect(await getHabits()).toHaveLength(7);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir hábito' }));
    await waitFor(async () => expect(await getHabits()).toHaveLength(6));
  });

  it('edita meta e limite máximo do sono, e reordena com os botões', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Aumentar Limite máximo de Sono' }));
    await user.click(screen.getByRole('button', { name: 'Aumentar Meta de Pausas ativas' }));
    await user.click(screen.getByRole('button', { name: 'Subir Pausas ativas' }));
    await waitFor(async () => {
      const list = await getHabits();
      expect(list.find((h) => h.key === 'sleep')?.targetMax).toBe(9.5);
      expect(list.find((h) => h.key === 'active_breaks')?.target).toBe(7);
      expect(list.map((h) => h.key).slice(0, 2)).toEqual(['active_breaks', 'movement']);
    });
  });

  it('modo progressivo e teto do movimento', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('switch', { name: 'Modo progressivo' }));
    await user.click(
      await screen.findByRole('button', { name: 'Aumentar Teto da meta de movimento' }),
    );
    await waitFor(async () => {
      const movement = (await getHabits()).find((h) => h.key === 'movement');
      expect(movement?.progressive).toEqual({ enabled: true, ceiling: 35 });
    });
  });
});

describe('dados', () => {
  it('falha ao escolher ou ler o arquivo (nativo) avisa e não altera os dados', async () => {
    const user = userEvent.setup();
    vi.mocked(files.pickFile).mockRejectedValue(new Error('fs negado'));
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Importar backup' }));
    await waitFor(() =>
      expect(ui.toast).toHaveBeenCalledWith('Não foi possível concluir agora. Tente novamente.'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('importar arquivo inválido mostra o erro e não altera os dados', async () => {
    const user = userEvent.setup();
    const [movement] = await getHabits();
    if (!movement) throw new Error('sem hábitos');
    await setEntry(movement, TODAY, 20);
    const before = await getEntriesForDate(TODAY);
    vi.mocked(files.pickFile).mockResolvedValue('{"app":"outro"}');
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Importar backup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Arquivo de backup inválido. Nenhum dado foi alterado.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await getEntriesForDate(TODAY)).toEqual(before);
  });

  it('backup com horário de lembrete inválido é rejeitado na importação', async () => {
    const user = userEvent.setup();
    const backup = await exportAll();
    backup.data.settings.reminders.movement.time = '25:99';
    vi.mocked(files.pickFile).mockResolvedValue(JSON.stringify(backup));
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Importar backup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo de backup inválido');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('importar backup válido pede confirmação e substitui os dados', async () => {
    const user = userEvent.setup();
    const [movement] = await getHabits();
    if (!movement) throw new Error('sem hábitos');
    await setEntry(movement, TODAY, 20);
    const backup = await exportAll();
    await setEntry(movement, TODAY, 5);
    vi.mocked(files.pickFile).mockResolvedValue(JSON.stringify(backup));
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Importar backup' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('substitui todos os dados atuais');
    expect(dialog).toHaveTextContent('sincronização será ligada');
    expect((await getEntriesForDate(TODAY))[0]?.value).toBe(5);
    await user.click(within(dialog).getByRole('button', { name: 'Substituir dados' }));
    await waitFor(async () => expect((await getEntriesForDate(TODAY))[0]?.value).toBe(20));
  });

  it('exporta JSON e CSV com os nomes de arquivo e colunas esperados, sem anotações no CSV', async () => {
    const user = userEvent.setup();
    const [movement] = await getHabits();
    if (!movement) throw new Error('sem hábitos');
    await setEntry(movement, TODAY, 30);
    await saveDailyLog({
      id: TODAY,
      date: TODAY,
      stress: 2,
      mood: 4,
      energy: 3,
      sleepQuality: 5,
      note: 'segredo',
    });
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Exportar backup (JSON)' }));
    await user.click(screen.getByRole('button', { name: 'Exportar registros (CSV)' }));
    await waitFor(() => expect(files.downloadFile).toHaveBeenCalledTimes(2));
    const [json, csv] = vi.mocked(files.downloadFile).mock.calls;
    expect(json?.[0]).toBe('nexo-check-backup-2026-11-18.json');
    expect(json?.[1]).toContain('segredo');
    expect(csv?.[0]).toBe('nexo-check-registros-2026-11-18.csv');
    const lines = (csv?.[1] ?? '').replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('data;estresse;humor;disposicao;sono;checklist_pct;minutos_movimento');
    expect(lines[1]).toBe('2026-11-18;2;4;3;5;17;30');
    expect(csv?.[1]).not.toContain('segredo');
  });

  describe('apagar tudo', () => {
    const registered = async () =>
      updateSettings({ participant: { code: 'NEXO-ABCD', key: 'k'.repeat(24), registered: true } });

    it('servidor falhando abre o diálogo e só apaga localmente após confirmar', async () => {
      const user = userEvent.setup();
      await registered();
      const deleteRemote = vi.fn().mockRejectedValue(new Error('offline'));
      renderConfig(deleteRemote);
      await user.click(await screen.findByRole('button', { name: 'Apagar todos os dados' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar tudo' }),
      );
      expect(
        await screen.findByText('Não foi possível apagar no servidor. Apagar só neste aparelho?'),
      ).toBeInTheDocument();
      expect(deleteRemote).toHaveBeenCalledOnce();
      expect(await db.habits.count()).toBe(6);
      await user.click(screen.getByRole('button', { name: 'Apagar só neste aparelho' }));
      await waitFor(async () => expect(await db.habits.count()).toBe(0));
      expect(await screen.findByText('tela de boas-vindas')).toBeInTheDocument();
    });

    it('servidor ok apaga o local e volta para as boas-vindas', async () => {
      const user = userEvent.setup();
      await registered();
      const deleteRemote = vi.fn().mockResolvedValue(undefined);
      renderConfig(deleteRemote);
      await user.click(await screen.findByRole('button', { name: 'Apagar todos os dados' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar tudo' }),
      );
      expect(await screen.findByText('tela de boas-vindas')).toBeInTheDocument();
      expect(deleteRemote).toHaveBeenCalledOnce();
      expect(await db.habits.count()).toBe(0);
      expect((await getSettings()).onboardingDone).toBe(false);
    });

    it('sem sincronização registrada não chama o servidor', async () => {
      const user = userEvent.setup();
      const deleteRemote = vi.fn().mockRejectedValue(new Error('x'));
      renderConfig(deleteRemote);
      await user.click(await screen.findByRole('button', { name: 'Apagar todos os dados' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar tudo' }),
      );
      expect(await screen.findByText('tela de boas-vindas')).toBeInTheDocument();
      expect(deleteRemote).not.toHaveBeenCalled();
    });
  });
});

describe('tema segue as configurações', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('importar backup com tema escuro aplica a classe e atualiza o espelho; apagar volta a system', async () => {
    const user = userEvent.setup();
    await updateSettings({ theme: 'dark' });
    const backup = await exportAll();
    await updateSettings({ theme: 'light' });
    vi.mocked(files.pickFile).mockResolvedValue(JSON.stringify(backup));
    renderConfig();
    await waitFor(() => expect(localStorage.getItem('nexo-theme')).toBe('light'));
    await user.click(await screen.findByRole('button', { name: 'Importar backup' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Substituir dados' }),
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(localStorage.getItem('nexo-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar tudo' }),
    );
    await waitFor(() => expect(localStorage.getItem('nexo-theme')).toBe('system'));
  });
});

describe('lembretes', () => {
  it('janela com fim antes do início mostra erro e não salva', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('switch', { name: 'Ativar lembrete de Água' }));
    const to = await screen.findByLabelText('Água: fim');
    fireEvent.change(to, { target: { value: '07:00' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O horário final precisa ser depois',
    );
    expect((await getSettings()).reminders.water.to).toBe('20:00');
  });
});

describe('tema, sincronização e sobre', () => {
  it('persiste o tema escolhido em settings e no espelho do localStorage', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('radio', { name: 'Escuro' }));
    await waitFor(async () => expect((await getSettings()).theme).toBe('dark'));
    expect(localStorage.getItem('nexo-theme')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    document.documentElement.classList.remove('dark');
  });

  it('sem cadastro mostra o status e botões de sincronização desativados', async () => {
    renderConfig();
    expect(
      await screen.findByText('Sincronização ainda não configurada neste aparelho.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeDisabled();
  });

  it('mostra código e chave (oculta até pedir) e a versão do app', async () => {
    const user = userEvent.setup();
    await updateSettings({
      participant: { code: 'NEXO-ABCD', key: 'K'.repeat(24), registered: false },
    });
    renderConfig();
    expect(await screen.findByText('NEXO-ABCD')).toBeInTheDocument();
    expect(screen.queryByText('K'.repeat(24))).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar chave' }));
    expect(screen.getByText('K'.repeat(24))).toBeInTheDocument();
    expect(screen.getByText(/^Versão /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repositório no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/JoaoGabrielOT/nexo-check',
    );
  });
});

describe('Verificar atualizações', () => {
  beforeEach(() => vi.mocked(ui.toast).mockClear());
  afterEach(() => setUpdaterAdapterForTests(undefined));

  it('no nativo, sem versão nova, avisa que já está na mais recente', async () => {
    setUpdaterAdapterForTests({ check: async () => null, install: async () => 'installing' });
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Verificar atualizações' }));
    await waitFor(() =>
      expect(ui.toast).toHaveBeenCalledWith('Você já está na versão mais recente.'),
    );
  });

  it('no nativo, falha na verificação mostra o erro genérico', async () => {
    setUpdaterAdapterForTests({
      check: () => Promise.reject(new Error('offline')),
      install: async () => 'installing',
    });
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Verificar atualizações' }));
    await waitFor(() =>
      expect(ui.toast).toHaveBeenCalledWith('Não foi possível concluir agora. Tente novamente.'),
    );
  });

  it('na web (sem adaptador) segue o caminho do service worker', async () => {
    setUpdaterAdapterForTests(null);
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Verificar atualizações' }));
    await waitFor(() =>
      expect(ui.toast).toHaveBeenCalledWith(
        'Atualizações automáticas não estão disponíveis neste navegador.',
      ),
    );
  });
});
