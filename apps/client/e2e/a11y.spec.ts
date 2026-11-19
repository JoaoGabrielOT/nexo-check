import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { completeOnboarding, expect, test } from './fixtures';

// Só `serious` e `critical` reprovam; o tema vem do projeto (claro no mobile, escuro no desktop).
async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    blocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        data: n.any.map((c) => c.data),
      })),
    })),
  ).toEqual([]);
}

const SCREENS = [
  { name: 'Hoje', path: '/', ready: 'Movimento do dia' },
  { name: 'Registro', path: '/registro', ready: 'Estresse percebido' },
  { name: 'Progresso', path: '/progresso', ready: null },
  { name: 'Aprender', path: '/aprender', ready: null },
  { name: 'Projeto', path: '/projeto', ready: null },
  { name: 'Configurações', path: '/config', ready: 'Aparência' },
] as const;

test.describe('acessibilidade (axe)', () => {
  for (const screen of SCREENS) {
    test(screen.name, async ({ page }) => {
      await completeOnboarding(page, 'decline');
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (screen.ready)
        await expect(page.getByRole('region', { name: screen.ready })).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }

  test('Admin (logado)', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('nexo-admin-token', 'token-de-teste'));
    await page.goto('/admin');
    await expect(page.getByRole('region', { name: 'Participação' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('Onboarding, passo 1', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Boas-vindas' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
