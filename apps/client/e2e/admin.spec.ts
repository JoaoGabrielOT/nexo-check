import { expect, test } from './fixtures';
import { ADMIN_PASSWORD } from './mock-api';

test('senha errada mostra erro', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
});

test('login, indicadores e criação de sessão com QR', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Senha').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
  for (const name of ['Participação', 'Compreensão', 'Aceitação', 'Adesão ao movimento']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Sessões' }).click();
  await page.getByLabel('Local').fill('Sala 101');
  await page.getByRole('button', { name: 'Criar sessão' }).click();
  await expect(page.getByRole('img', { name: /QR code de check-in da oficina 1/ })).toBeVisible();
});
