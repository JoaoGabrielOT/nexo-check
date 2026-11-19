import { readFileSync } from 'node:fs';
import { completeOnboarding, expect, test } from './fixtures';

test('exportar o backup baixa um JSON do nexo-check', async ({ page }) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/config');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup (JSON)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^nexo-check-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(readFileSync(await file.path(), 'utf-8')).toContain('"app": "nexo-check"');
});

test('importar um arquivo inválido mostra erro e não altera os dados', async ({ page }) => {
  await completeOnboarding(page, 'decline');
  await page.getByRole('button', { name: /Adicionar 10 minutos/ }).click();
  const movement = page.getByRole('region', { name: 'Movimento do dia' });
  await expect(movement.getByText('10', { exact: true })).toBeVisible();

  await page.goto('/config');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar backup' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'invalido.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"outro-app"}'),
  });
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Arquivo de backup inválido. Nenhum dado foi alterado.' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/');
  await expect(movement.getByText('10', { exact: true })).toBeVisible();
});
