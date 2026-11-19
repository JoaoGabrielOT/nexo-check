import { completeOnboarding, expect, test } from './fixtures';

const DARK = /(^|\s)dark(\s|$)/;

test('tema escuro aplica a classe dark e persiste depois de recarregar', async ({ page }) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/config');
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveClass(DARK);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(DARK);
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();

  await page.getByRole('radio', { name: 'Claro' }).click();
  await expect(page.locator('html')).not.toHaveClass(DARK);
});
