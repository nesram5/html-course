import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

import { enterOffice } from './support/world';

const CLIENT = { 'x-bululu-client': 'e2e' };

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
    await enterOffice(page);
    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    // In the office (joined in real time): the avatar has a tile.
    await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 15_000 });
    const kicked = await owner.context.request.delete(
      `/api/spaces/${owner.space.id}/members/${luisId}`,
      { headers: CLIENT },
    );
    expect(kicked.status()).toBe(204);

    // space:kicked (E4): out of the office at once, with an explanation.
    await expect(page).toHaveURL(/\/spaces$/);
    await expect(page.getByText('Te han expulsado de este espacio.')).toBeVisible();
    await page.goto(`/s/${owner.space.slug}`);

    await expect(page.getByRole('alert')).toHaveText('No eres miembro de este espacio.');
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await owner.context.close();
  });

  test('a removed member cannot rejoin with the invite link until the owner readmits them', async ({
    browser,
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const owner = await ownerWithSpace(browser, run);
    const evaId = await signIn(page.request, `eva-${run}@gmail.com`);
    const invitePath = new URL(owner.space.inviteUrl).pathname;
    const token = invitePath.split('/').pop() ?? '';
    expect((await page.request.post(`/api/join/${token}`, { headers: CLIENT })).status()).toBe(200);
    const kicked = await owner.context.request.delete(
      `/api/spaces/${owner.space.id}/members/${evaId}`,
      { headers: CLIENT },
    );
    expect(kicked.status()).toBe(204);

    await page.goto(invitePath);
    await expect(
      page.getByRole('heading', { name: 'Ya no puedes unirte a este espacio' }),
    ).toBeVisible();

    await owner.page.goto(`/spaces/${owner.space.id}/settings`);
    const bans = owner.page.getByRole('region', { name: 'Personas expulsadas' });
    await expect(bans).toContainText(`eva-${run}@gmail.com`);
    await bans.getByRole('button', { name: `Readmitir a eva-${run}` }).click();
    await expect(
      owner.page.getByText(`eva-${run} puede volver a unirse al espacio.`),
    ).toBeVisible();

    await page.goto(invitePath);
    await expect(page).toHaveURL(new RegExp(`/s/${owner.space.slug}$`));
    await owner.context.close();
  });

  test('a cancelled Google sign-in says so and keeps the original route', async ({ page }) => {
    // The fake identity provider of the test server: start the flow without following Google.
    const start = await page.request.get('/api/auth/google?next=/spaces/new', { maxRedirects: 0 });
    expect(start.status()).toBe(302);

    await page.goto('/api/auth/google/callback?error=access_denied');

    await expect(page).toHaveURL(/\/login\?error=cancelled&next=%2Fspaces%2Fnew$/);
    await expect(page.getByRole('alert')).toContainText(
      'Has cancelado el inicio de sesión con Google.',
    );
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
