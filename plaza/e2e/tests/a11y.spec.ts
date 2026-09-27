import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/a11y';
import { createSpace, enterOffice, joinByInvite, signIn } from './support/world';

/**
 * E8-S6: axe (WCAG 2.1 A/AA and best practices) finds no critical or serious problem on any page
 * of the app: public pages, the signed-in pages, the dialogs, and the office with its panels open.
 */

/** The admin of the metrics page (`ADMIN_EMAILS` of the E2E server). */
const ADMIN = 'producto@plaza.test';

async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status').filter({ hasText: /^Cargando…$/ })).toHaveCount(0);
}

test.describe('accessibility audit with axe (E8-S6)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('public pages: home, login, privacy and the invitation', async ({ browser, page }) => {
    const owner = await browser.newContext();
    await signIn(owner.request, `owner-${randomUUID().slice(0, 8)}@acme.com`, 'Ana');
    const space = await createSpace(owner.request, `Accesible ${randomUUID().slice(0, 6)}`);

    for (const path of ['/', '/login', '/privacidad', new URL(space.inviteUrl).pathname]) {
      await page.goto(path);
      await settled(page);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, path);
    }
    await owner.close();
  });

  test('signed-in pages and dialogs: spaces, creation, settings, profile, feedback, metrics', async ({
    browser,
    page,
  }) => {
    await signIn(page.request, ADMIN, 'Producto');
    const space = await createSpace(page.request, `Ajustes ${randomUUID().slice(0, 6)}`);
    const luis = await browser.newContext();
    await signIn(luis.request, `luis-${randomUUID().slice(0, 8)}@acme.com`, 'Luis');
    await joinByInvite(luis.request, space);

    const pages: [string, string][] = [
      ['/spaces', 'Mis espacios'],
      ['/spaces/new', ''],
      [`/spaces/${space.id}/settings`, 'Miembros'],
      ['/profile', 'Borrar mi cuenta'],
      ['/comentarios', 'Enviar comentarios'],
      ['/admin/metricas', 'Métricas de la beta'],
    ];
    for (const [path, heading] of pages) {
      await page.goto(path);
      await settled(page);
      if (heading !== '') await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expectAccessible(page, path);
    }

    // The confirmation of "Borrar mi cuenta" (a modal dialog): Luis may delete his account.
    const luisPage = await luis.newPage();
    await luisPage.goto('/profile');
    await luisPage.getByRole('button', { name: 'Borrar mi cuenta…' }).click();
    await expect(luisPage.getByRole('alertdialog')).toBeVisible();
    await expectAccessible(luisPage, 'profile with the delete dialog open');
    await luisPage.keyboard.press('Escape');
    await expect(luisPage.getByRole('alertdialog')).toHaveCount(0);
    await luis.close();
  });

  test('the office: pre-join, bar, side panels, menus and dialogs', async ({ page }) => {
    await signIn(page.request, `ana-${randomUUID().slice(0, 8)}@acme.com`, 'Ana');
    const space = await createSpace(page.request, `Oficina ${randomUUID().slice(0, 6)}`);

    await page.goto(`/s/${space.slug}`);
    await expect(page.getByTestId('prejoin')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page, 'the pre-join');
    await enterOffice(page);
    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 30_000 });
    await expectAccessible(page, 'the office with the hallway notice');

    const bar = page.getByRole('group', { name: 'Tus controles' });
    await bar.getByRole('button', { name: /^Personas/ }).click();
    await expect(page.getByRole('region', { name: 'Personas', exact: true })).toBeVisible();
    await expectAccessible(page, 'the office with "Personas" open');

    await bar.getByRole('button', { name: 'Chat del espacio' }).click();
    await expect(page.getByRole('textbox', { name: 'Mensaje para todo el espacio' })).toBeVisible();
    await expectAccessible(page, 'the office with the chat open');

    await bar.getByRole('button', { name: /^Estado:/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectAccessible(page, 'the office with the status menu open');
    await page.keyboard.press('Escape');

    await bar.getByRole('button', { name: 'Reaccionar' }).click();
    await expectAccessible(page, 'the office with the reactions open');
    await page.keyboard.press('Escape');

    const speaker = bar.getByRole('button', { name: /^Altavoz/ });
    if ((await speaker.count()) > 0) {
      await speaker.click();
      await expect(page.getByRole('dialog', { name: 'Elegir altavoz' })).toBeVisible();
      await expectAccessible(page, 'the office with the speaker switch open');
      await page.keyboard.press('Escape');
    }
  });
});
