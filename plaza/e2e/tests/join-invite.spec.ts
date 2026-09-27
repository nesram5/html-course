import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

const CLIENT = { 'x-plaza-client': 'e2e' };

async function signIn(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post('/api/auth/test-login', {
    headers: CLIENT,
    data: { email, displayName: email.split('@')[0] },
  });
  expect(response.status()).toBe(200);
}

test.describe('invitation link (E2-S5)', () => {
  test('invitation link → test login → member of the space', async ({ browser, page }) => {
    const run = randomUUID().slice(0, 8);

    // Ana creates the space in her own browser context.
    const anaContext = await browser.newContext();
    await signIn(anaContext.request, `ana-${run}@acme.com`);
    const created = await anaContext.request.post('/api/spaces', {
      headers: CLIENT,
      data: { name: `Oficina Acme ${run}`, mapTemplateId: 'office-small@1' },
    });
    expect(created.status()).toBe(201);
    const { space } = (await created.json()) as {
      space: { id: string; slug: string; inviteUrl: string };
    };
    const invitePath = new URL(space.inviteUrl).pathname;

    // Luis opens the link without a session.
    await page.goto(invitePath);
    await expect(
      page.getByRole('heading', { name: `Te han invitado a Oficina Acme ${run}` }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();

    // Test login (instead of Google), then the first-time avatar prompt.
    await page.getByLabel('Email de prueba').fill(`luis-${run}@acme.com`);
    await page.getByRole('button', { name: 'Entrar como prueba' }).click();
    await expect(
      page.getByRole('heading', { name: 'Elige cómo te verán en el mapa' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Verde' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Inside the space.
    await expect(page).toHaveURL(new RegExp(`/s/${space.slug}$`));
    const mine = await page.request.get('/api/spaces');
    expect(await mine.json()).toMatchObject({
      spaces: [{ id: space.id, slug: space.slug, role: 'MEMBER' }],
    });
    const members = await anaContext.request.get(`/api/spaces/${space.id}/members`);
    expect(await members.json()).toMatchObject({
      members: [
        { role: 'OWNER' },
        { role: 'MEMBER', email: `luis-${run}@acme.com`, avatarId: 'avatar-02' },
      ],
    });

    // Opening the link again just enters the space (idempotent).
    await page.goto(invitePath);
    await expect(page).toHaveURL(new RegExp(`/s/${space.slug}$`));

    await anaContext.close();
  });
});
