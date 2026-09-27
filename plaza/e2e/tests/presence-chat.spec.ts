import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  setTabHidden,
  signIn,
  type CreatedSpace,
} from './support/world';

/**
 * E7 end to end: two people (two browser contexts) in the same office through the real server:
 * status and away, the "Personas" panel, chat, reactions and ring.
 */

interface Person {
  context: BrowserContext;
  page: Page;
  userId: string;
}

declare global {
  interface Window {
    /** Browser notifications shown in the page (stubbed `Notification`, see `person`). */
    __notifications?: { title: string; body: string; silent: boolean }[];
  }
}

async function person(browser: Browser, email: string, name: string): Promise<Person> {
  const context = await browser.newContext();
  // Headless Chromium has no notification UI: record them instead, with the permission granted.
  await context.addInitScript(() => {
    const shown: { title: string; body: string; silent: boolean }[] = [];
    window.__notifications = shown;
    class RecordingNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      onclick: (() => void) | null = null;
      constructor(title: string, options: { body?: string; silent?: boolean } = {}) {
        shown.push({ title, body: options.body ?? '', silent: options.silent ?? false });
      }
      close() {
        return undefined;
      }
    }
    Object.defineProperty(window, 'Notification', { value: RecordingNotification });
  });
  const userId = await signIn(context.request, email, name);
  return { context, page: await context.newPage(), userId };
}

/** Ana and Luis are in the same office. */
async function anaAndLuis(browser: Browser) {
  const run = randomUUID().slice(0, 8);
  const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
  const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
  const space: CreatedSpace = await createSpace(ana.context.request, `Presencia ${run}`);
  await joinByInvite(luis.context.request, space);
  await openOffice(ana.page, space.slug);
  await openOffice(luis.page, space.slug);
  await expect.poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha).toBe(1);
  await expect.poll(async () => (await remoteAvatar(luis.page, ana.userId))?.alpha).toBe(1);
  return { ana, luis, space };
}

function bottomBar(page: Page) {
  return page.getByRole('group', { name: 'Tus controles' });
}

test.describe('presence, chat and reactions (E7)', () => {
  // Two offices to draw, plus a reload in some tests.
  test.describe.configure({ timeout: 90_000 });

  test('a status change is seen by the other person and survives a reload', async ({ browser }) => {
    const { ana, luis, space } = await anaAndLuis(browser);

    await bottomBar(ana.page).getByRole('button', { name: 'Estado: Disponible' }).click();
    await ana.page.getByRole('menuitemradio', { name: /Ocupado/ }).click();
    await expect(
      bottomBar(ana.page).getByRole('button', { name: 'Estado: Ocupado' }),
    ).toBeVisible();

    // Red dot over Ana for Luis, and "Ocupado" in his "Personas" panel.
    await expect
      .poll(async () => (await remoteAvatar(luis.page, ana.userId))?.presence)
      .toBe('busy');
    await bottomBar(luis.page)
      .getByRole('button', { name: /Personas/ })
      .click();
    await expect(luis.page.getByTestId(`person-${ana.userId}`)).toContainText('Ocupado');

    // Hidden tab → "Ausente" (grey) for Luis; back → her chosen status again.
    await setTabHidden(ana.page, true);
    await expect
      .poll(async () => (await remoteAvatar(luis.page, ana.userId))?.presence)
      .toBe('away');
    await expect(luis.page.getByTestId(`person-${ana.userId}`)).toContainText('Ausente');
    await setTabHidden(ana.page, false);
    await expect
      .poll(async () => (await remoteAvatar(luis.page, ana.userId))?.presence)
      .toBe('busy');

    // Reload: the chosen status comes back from Membership.status.
    await openOffice(ana.page, space.slug);
    await expect(
      bottomBar(ana.page).getByRole('button', { name: 'Estado: Ocupado' }),
    ).toBeVisible();

    await ana.context.close();
    await luis.context.close();
  });

  test('"Localizar" shows the other person for 3 s and comes back', async ({ browser }) => {
    const { ana, luis } = await anaAndLuis(browser);

    await bottomBar(luis.page)
      .getByRole('button', { name: /Personas/ })
      .click();
    await luis.page.getByRole('button', { name: 'Localizar a Ana en el mapa' }).click();

    await expect
      .poll(() => luis.page.evaluate(() => window.__plazaWorld?.cameraTarget()))
      .toBe(ana.userId);
    await expect
      .poll(() => luis.page.evaluate(() => window.__plazaWorld?.cameraTarget()), {
        timeout: 6000,
      })
      .toBeNull();

    await ana.context.close();
    await luis.context.close();
  });

  test('a chat message reaches the other person, with an unread counter and safe links', async ({
    browser,
  }) => {
    const { ana, luis } = await anaAndLuis(browser);

    await bottomBar(ana.page).getByRole('button', { name: 'Chat del espacio' }).click();
    const input = ana.page.getByRole('textbox', { name: 'Mensaje para todo el espacio' });
    const before = await ana.page.getByTestId('world-canvas').getAttribute('data-tile-y');
    // Arrows typed in the chat box never move the avatar.
    await input.fill('Hola <b>equipo</b>, el acta: https://example.com/acta');
    await input.press('ArrowUp');
    await input.press('Enter');
    await expect(ana.page.getByTestId('chat-message')).toHaveCount(1);
    await expect(ana.page.getByTestId('world-canvas')).toHaveAttribute('data-tile-y', before ?? '');

    await expect(luis.page.getByTestId('chat-unread')).toHaveText('1');
    await bottomBar(luis.page)
      .getByRole('button', { name: /mensaje sin leer/ })
      .click();
    const received = luis.page.getByTestId('chat-message');
    await expect(received).toContainText('Ana');
    await expect(received).toContainText('Hola <b>equipo</b>, el acta:');
    await expect(received.getByRole('link', { name: 'https://example.com/acta' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await expect(luis.page.getByTestId('chat-unread')).toHaveCount(0);

    // History: after a reload the message is still there.
    await luis.page.reload();
    await expect(luis.page.getByTestId('world-canvas')).toHaveAttribute('data-tile-x', /^\d+$/, {
      timeout: 30_000,
    });
    await bottomBar(luis.page).getByRole('button', { name: 'Chat del espacio' }).click();
    await expect(luis.page.getByTestId('chat-message')).toContainText('Hola <b>equipo</b>');

    await ana.context.close();
    await luis.context.close();
  });

  test('a reaction floats over the avatar for everyone for 3 s', async ({ browser }) => {
    const { ana, luis } = await anaAndLuis(browser);

    await ana.page.getByTestId('world-canvas').focus();
    await ana.page.keyboard.press('3');

    await expect.poll(async () => (await remoteAvatar(luis.page, ana.userId))?.reaction).toBe('🎉');
    await expect
      .poll(async () => (await remoteAvatar(luis.page, ana.userId))?.reaction, { timeout: 6000 })
      .toBeNull();

    // With the emoji button too; Ana sees her own reaction.
    await bottomBar(ana.page).getByRole('button', { name: 'Reaccionar' }).click();
    await ana.page.getByRole('button', { name: 'Corazón (tecla 1)' }).click();
    await expect.poll(async () => (await remoteAvatar(luis.page, ana.userId))?.reaction).toBe('❤️');

    await ana.context.close();
    await luis.context.close();
  });

  test('ringing someone shows a notification on their side, then a 30 s countdown', async ({
    browser,
  }) => {
    const { ana, luis } = await anaAndLuis(browser);

    await bottomBar(ana.page)
      .getByRole('button', { name: /Personas/ })
      .click();
    await ana.page.getByRole('button', { name: 'Llamar a Luis' }).click();

    await expect(
      luis.page.getByRole('status').filter({ hasText: 'Ana te está llamando' }),
    ).toBeVisible();
    await expect
      .poll(() => luis.page.evaluate(() => window.__notifications))
      .toEqual([
        { title: 'Ana te está llamando', body: 'Vuelve a Plaza para hablar.', silent: false },
      ]);
    await expect(
      ana.page.getByRole('button', { name: /Podrás volver a llamar a Luis en (30|29) s/ }),
    ).toBeDisabled();

    await ana.context.close();
    await luis.context.close();
  });
});
