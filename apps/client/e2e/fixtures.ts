import { expect, test as base, type Page } from '@playwright/test';
import { MockApi } from './mock-api';

export { expect };

interface Fixtures {
  api: MockApi;
}

/** `test` com a API falsa instalada em cada página (automática: vale mesmo sem pedir `api`). */
export const test = base.extend<Fixtures>({
  api: [
    async ({ page }, use) => {
      const api = new MockApi();
      await api.install(page);
      await use(api);
    },
    { auto: true },
  ],
});

/** Passa pelo onboarding. `accept` devolve o código de participante mostrado na tela. */
export async function completeOnboarding(
  page: Page,
  choice: 'accept' | 'decline',
): Promise<string | null> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (choice === 'decline') {
    await page.getByRole('button', { name: 'Usar sem enviar dados' }).click();
    await expect(page.getByRole('region', { name: 'Movimento do dia' })).toBeVisible();
    return null;
  }
  await page.getByRole('button', { name: 'Concordo e quero participar da pesquisa' }).click();
  const code = (await page.locator('#onboarding-code ~ code').textContent())?.trim() ?? '';
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('region', { name: 'Movimento do dia' })).toBeVisible();
  return code;
}

/** Força uma sincronização pelo botão das configurações (sem esperar o debounce de 5 s). */
export async function syncFromSettings(page: Page): Promise<void> {
  await page.goto('/config');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByText('Sincronizado.').first()).toBeVisible();
}
