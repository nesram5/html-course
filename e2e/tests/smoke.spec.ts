import { expect, test } from '@playwright/test';

test.describe('app shell (E0-S4)', () => {
  test('shows the home page and reaches the API through the Vite proxy', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Plaza' })).toBeVisible();
    await expect(page.getByTestId('server-status')).toHaveText(
      /Conectado \(versión \d+\.\d+\.\d+\)/,
    );
  });

  test('proxies /api to the server', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('shows a 404 page for unknown routes', async ({ page }) => {
    await page.goto('/esta-ruta-no-existe');

    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL('/');
  });
});
