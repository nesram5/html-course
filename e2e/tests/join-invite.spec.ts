import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { enterOffice, openOffice, remoteAvatar } from './support/world';

const CLIENT = { 'x-bululu-client': 'e2e' };
/** The admin of the metrics page (`ADMIN_EMAILS` of the E2E server). */
const ADMIN = 'producto@bululu.test';

interface Metrics {
  o2: { spaces: { spaceId: string; daysPerWeek: number[] }[] };
  o4: { sessions: number };
  o5: { samples: number };
}

async function metrics(request: APIRequestContext): Promise<Metrics> {
  const response = await request.get('/api/admin/metrics?days=7');
  expect(response.status()).toBe(200);
  return (await response.json()) as Metrics;
}

async function signIn(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post('/api/auth/test-login', {
    headers: CLIENT,
    data: { email, displayName: email.split('@')[0] },
  });
  expect(response.status()).toBe(200);
}

test.describe('invitation link (E2-S5, brief flow 2)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('brief flow 2: invitation link → sign-in → avatar → pre-join → on the map in < 30 s', async ({
    browser,
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const admin = await browser.newContext();
    await signIn(admin.request, ADMIN);
    const before = await metrics(admin.request);

    // Ana creates the space in her own browser context and waits in the office.
    const anaContext = await browser.newContext();
    await signIn(anaContext.request, `ana-${run}@acme.com`);
    const anaAvatar = await anaContext.request.patch('/api/me', {
      headers: CLIENT,
      data: { avatarId: 'avatar-01' },
    });
    expect(anaAvatar.status()).toBe(200);
    const created = await anaContext.request.post('/api/spaces', {
      headers: CLIENT,
      data: { name: `Oficina Acme ${run}`, mapTemplateId: 'office-small@1' },
    });
    expect(created.status()).toBe(201);
    const { space } = (await created.json()) as {
      space: { id: string; slug: string; inviteUrl: string };
    };
    const invitePath = new URL(space.inviteUrl).pathname;
    const anaPage = await anaContext.newPage();
    await openOffice(anaPage, space.slug);

    // Luis opens the link without a session.
    const started = Date.now();
    await page.goto(invitePath);
    await expect(
      page.getByRole('heading', { name: `Te han invitado a Oficina Acme ${run}` }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();

    // Test login (instead of Google), then the first-time avatar prompt and the pre-join.
    await page.getByLabel('Email de prueba').fill(`luis-${run}@acme.com`);
    await page.getByRole('button', { name: 'Entrar como prueba' }).click();
    await expect(
      page.getByRole('heading', { name: 'Elige cómo te verán en el mapa' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Menta' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${space.slug}$`));
    await enterOffice(page, { media: true });

    // On the map, in the real space, in less than 30 s (brief flow 2, O5).
    await expect(page.getByRole('heading', { name: `Oficina Acme ${run}` })).toBeVisible();
    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-tile-x', /^\d+$/, {
      timeout: 30_000,
    });
    expect(Date.now() - started).toBeLessThan(30_000);
    const mine = await page.request.get('/api/spaces');
    expect(await mine.json()).toMatchObject({
      spaces: [{ id: space.id, slug: space.slug, role: 'MEMBER' }],
    });
    const members = await anaContext.request.get(`/api/spaces/${space.id}/members`);
    const listed = (await members.json()) as { members: { userId: string; email: string }[] };
    expect(listed).toMatchObject({
      members: [
        { role: 'OWNER' },
        { role: 'MEMBER', email: `luis-${run}@acme.com`, avatarId: 'avatar-02' },
      ],
    });
    // Ana sees him arrive.
    const luisId = listed.members.find((m) => m.email === `luis-${run}@acme.com`)?.userId ?? '';
    await expect.poll(async () => (await remoteAvatar(anaPage, luisId))?.alpha).toBe(1);

    // Leaving sends the measurements of the visit: the metrics page counts them (E8-S7).
    await page.getByRole('link', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await expect
      .poll(async () => (await metrics(admin.request)).o5.samples, { timeout: 15_000 })
      .toBeGreaterThan(before.o5.samples);
    const after = await metrics(admin.request);
    expect(after.o4.sessions).toBeGreaterThan(before.o4.sessions);
    expect(after.o2.spaces.find((entry) => entry.spaceId === space.id)?.daysPerWeek).toEqual([1]);

    // Opening the link again just enters the space (idempotent).
    await page.goto(invitePath);
    await expect(page).toHaveURL(new RegExp(`/s/${space.slug}$`));

    await anaContext.close();
    await admin.close();
  });

  test('opening /s/:slug with an allowed e-mail domain joins the space', async ({
    browser,
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    const domain = `acme-${run}.com`;
    const anaContext = await browser.newContext();
    await signIn(anaContext.request, `ana@${domain}`);
    const created = await anaContext.request.post('/api/spaces', {
      headers: CLIENT,
      data: { name: `Oficina Dominio ${run}`, mapTemplateId: 'office-small@1' },
    });
    const { space } = (await created.json()) as { space: { id: string; slug: string } };
    const patched = await anaContext.request.patch(`/api/spaces/${space.id}`, {
      headers: CLIENT,
      data: { allowedDomain: domain },
    });
    expect(patched.status()).toBe(200);

    // Luis, from the same domain, opens the space URL: login, avatar, then the office.
    await page.goto(`/s/${space.slug}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('Email de prueba').fill(`luis@${domain}`);
    // A Google Workspace account of the domain (hd claim): the e-mail domain alone is not enough.
    await page.getByLabel(/Dominio de Google Workspace/).fill(domain);
    await page.getByRole('button', { name: 'Entrar como prueba' }).click();
    await page.getByRole('radio', { name: 'Menta' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page).toHaveURL(new RegExp(`/s/${space.slug}$`));
    await expect(page.getByRole('heading', { name: `Oficina Dominio ${run}` })).toBeVisible();
    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    const mine = await page.request.get('/api/spaces');
    expect(await mine.json()).toMatchObject({ spaces: [{ id: space.id, role: 'MEMBER' }] });

    await anaContext.close();
  });
});
