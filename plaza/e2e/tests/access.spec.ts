import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const CLIENT = { 'x-plaza-client': 'e2e' };

interface CreatedSpace {
  id: string;
  slug: string;
  name: string;
  inviteUrl: string;
}

async function signIn(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post('/api/auth/test-login', {
    headers: CLIENT,
    data: { email, displayName: email.split('@')[0] },
  });
  expect(response.status()).toBe(200);
  const avatar = await request.patch('/api/me', {
    headers: CLIENT,
    data: { avatarId: 'avatar-02' },
  });
  expect(avatar.status()).toBe(200);
  return ((await avatar.json()) as { user: { id: string } }).user.id;
}

async function ownerWithSpace(browser: Browser, run: string) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await signIn(context.request, `ana-${run}@acme.com`);
  const created = await context.request.post('/api/spaces', {
    headers: CLIENT,
    data: { name: `Acceso ${run}`, mapTemplateId: 'office-small@1' },
  });
  expect(created.status()).toBe(201);
  const { space } = (await created.json()) as { space: CreatedSpace };
  return { context, page: await context.newPage(), space };
}

test.describe('access to a space (E1-S3, E2-S4, E2-S6)', () => {
  test('"Regenerar enlace" revokes the copied link', async ({ browser, page }) => {
    const run = randomUUID().slice(0, 8);
    const owner = await ownerWithSpace(browser, run);

    await owner.page.goto(`/spaces/${owner.space.id}/settings`);
    const link = owner.page.getByLabel('Enlace para compartir');
    await expect(link).toHaveValue(owner.space.inviteUrl);
    await owner.page.getByRole('button', { name: 'Copiar enlace' }).click();
    expect(await owner.page.evaluate(() => navigator.clipboard.readText())).toBe(
      owner.space.inviteUrl,
    );
    await owner.page.getByRole('button', { name: 'Regenerar enlace' }).click();
    await owner.page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(link).not.toHaveValue(owner.space.inviteUrl);
    const fresh = await link.inputValue();

    await page.goto(new URL(owner.space.inviteUrl).pathname);
    await expect(
      page.getByRole('heading', { name: 'Esta invitación ya no es válida' }),
    ).toBeVisible();
    await page.goto(new URL(fresh).pathname);
    await expect(
      page.getByRole('heading', { name: `Te han invitado a ${owner.space.name}` }),
    ).toBeVisible();
    await owner.context.close();
  });

  test('a member removed by the owner cannot come back to the office from the same tab', async ({
    browser,
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const owner = await ownerWithSpace(browser, run);
    const luisId = await signIn(page.request, `luis-${run}@gmail.com`);
    const token = new URL(owner.space.inviteUrl).pathname.split('/').pop() ?? '';
    expect((await page.request.post(`/api/join/${token}`, { headers: CLIENT })).status()).toBe(200);

    await page.goto(`/s/${owner.space.slug}`);
    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    const kicked = await owner.context.request.delete(
      `/api/spaces/${owner.space.id}/members/${luisId}`,
      { headers: CLIENT },
    );
    expect(kicked.status()).toBe(204);

    await page.getByRole('link', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await page.goBack();

    await expect(page.getByRole('alert')).toHaveText('No eres miembro de este espacio.');
    await expect(page.locator('canvas')).toHaveCount(0);
    await owner.context.close();
  });

  test('a cancelled Google sign-in says so and keeps the original route', async ({ page }) => {
    // The fake identity provider of the test server: start the flow without following Google.
    const start = await page.request.get('/api/auth/google?next=/spaces/new', { maxRedirects: 0 });
    expect(start.status()).toBe(302);

    await page.goto('/api/auth/google/callback?error=access_denied');

    await expect(page).toHaveURL(/\/login\?error=cancelled&next=%2Fspaces%2Fnew$/);
    await expect(page.getByRole('alert')).toContainText('No se completó el inicio de sesión.');
    await expect(page.getByRole('link', { name: 'Entrar con Google' })).toHaveAttribute(
      'href',
      '/api/auth/google?next=%2Fspaces%2Fnew',
    );
  });

  test('a crafted next path never breaks the login page', async ({ page }) => {
    await signIn(page.request, `zoe-${randomUUID().slice(0, 8)}@acme.com`);

    // "/\t/evil.example.com" would become "//evil.example.com" once the browser drops the tab.
    await page.goto('/login?next=%2F%09%2Fevil.example.com');

    await expect(page).toHaveURL(/\/spaces$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis espacios' })).toBeVisible();
  });
});
