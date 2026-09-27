import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  CLIENT,
  avatars,
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  signIn,
  step,
  tapKey,
  tile,
  type CreatedSpace,
} from './support/world';

/**
 * E4 multiplayer, end to end: two people (two browser contexts, two test users) in the same
 * office, through the real server (space:join, player:move, 15 Hz world:delta).
 */

interface Person {
  context: BrowserContext;
  page: Page;
  userId: string;
}

async function person(browser: Browser, email: string, name: string): Promise<Person> {
  const context = await browser.newContext();
  const userId = await signIn(context.request, email, name);
  return { context, page: await context.newPage(), userId };
}

/** Ana owns a new space and Luis is a member; neither is in the office yet. */
async function anaAndLuis(browser: Browser) {
  const run = randomUUID().slice(0, 8);
  const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
  const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
  const space: CreatedSpace = await createSpace(ana.context.request, `Tiempo real ${run}`);
  await joinByInvite(luis.context.request, space);
  return { ana, luis, space };
}

test.describe('multiplayer in real time (E4)', () => {
  test('two people see each other and one sees the other walk', async ({ browser }) => {
    const { ana, luis, space } = await anaAndLuis(browser);

    await openOffice(ana.page, space.slug);
    const luisStart = await openOffice(luis.page, space.slug);

    // Ana sees Luis appear (faded in) where the server placed him, and vice versa.
    await expect
      .poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha, { timeout: 10_000 })
      .toBe(1);
    expect(await remoteAvatar(ana.page, luis.userId)).toMatchObject({
      tileX: luisStart.x,
      tileY: luisStart.y,
    });
    await expect.poll(async () => (await remoteAvatar(luis.page, ana.userId))?.alpha).toBe(1);

    // Luis walks two tiles up; Ana sees the remote avatar walk there (animated, then still).
    await luis.page.getByTestId('world-canvas').focus();
    await tapKey(luis.page, 'ArrowUp');
    await expect(luis.page.getByTestId('world-canvas')).toHaveAttribute(
      'data-tile-y',
      String(luisStart.y - 1),
    );
    await tapKey(luis.page, 'ArrowUp');
    await expect(luis.page.getByTestId('world-canvas')).toHaveAttribute(
      'data-tile-y',
      String(luisStart.y - 2),
    );
    await expect
      .poll(async () => {
        const seen = await remoteAvatar(ana.page, luis.userId);
        return seen && { x: seen.x, y: seen.y, tileY: seen.tileY, moving: seen.moving };
      })
      .toEqual({ x: luisStart.x, y: luisStart.y - 2, tileY: luisStart.y - 2, moving: false });

    // Every name is drawn over the "above" art layer (trees never hide it).
    for (const avatar of await avatars(ana.page)) expect(avatar.labelAboveArt).toBe(true);

    await ana.page.screenshot({ path: 'test-results/realtime-two-people.png' });
    await Promise.all([ana.context.close(), luis.context.close()]);
  });

  test('three people walk in the same office and each sees the other two (Hito M2)', async ({
    browser,
  }) => {
    test.setTimeout(90_000); // three offices to draw
    const { ana, luis, space } = await anaAndLuis(browser);
    const eva = await person(browser, `eva-${randomUUID().slice(0, 8)}@acme.com`, 'Eva');
    await joinByInvite(eva.context.request, space);
    const people = [ana, luis, eva];
    for (const someone of people) await openOffice(someone.page, space.slug);

    // Everyone walks up to three tiles up, one person after the other.
    const ends = new Map<string, { x: number; y: number }>();
    for (const [index, walker] of people.entries()) {
      const canvas = walker.page.getByTestId('world-canvas');
      await canvas.focus();
      for (let step = 1; step <= index + 1; step++) {
        const before = await tile(walker.page);
        await tapKey(walker.page, 'ArrowUp');
        await expect(canvas).toHaveAttribute('data-tile-y', String(before.y - 1));
      }
      ends.set(walker.userId, await tile(walker.page));
    }

    for (const viewer of people) {
      for (const other of people) {
        if (other === viewer) continue;
        await expect
          .poll(async () => {
            const seen = await remoteAvatar(viewer.page, other.userId);
            return seen && { x: seen.tileX, y: seen.tileY, alpha: seen.alpha };
          })
          .toEqual({ ...ends.get(other.userId), alpha: 1 });
      }
    }

    await Promise.all(people.map((someone) => someone.context.close()));
  });

  test('a short network cut: "Reconectando…", semi-transparent for others, back in place', async ({
    browser,
  }) => {
    const { ana, luis, space } = await anaAndLuis(browser);
    await openOffice(ana.page, space.slug);
    await openOffice(luis.page, space.slug);
    // One step up, confirmed by the server: Ana sees Luis on the new tile.
    await luis.page.getByTestId('world-canvas').focus();
    const before = await step(luis.page, 'ArrowUp', {
      seenBy: { page: ana.page, userId: luis.userId },
    });

    // The network goes away: the open WebSocket closes and new connections fail.
    await luis.context.setOffline(true);
    await luis.page.evaluate(() => {
      window.__bululuWorld?.dropConnection();
    });

    await expect(luis.page.getByTestId('connection-banner')).toHaveText('Reconectando…');
    await expect
      .poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha, { timeout: 10_000 })
      .toBe(0.5);

    // The network is back: fresh snapshot, same tile, opaque again for Ana.
    await luis.context.setOffline(false);
    await expect(luis.page.getByTestId('connection-banner')).toHaveText('', { timeout: 15_000 });
    expect(await tile(luis.page)).toEqual(before);
    await expect.poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha).toBe(1);
    expect(await remoteAvatar(ana.page, luis.userId)).toMatchObject({
      tileX: before.x,
      tileY: before.y,
    });

    await Promise.all([ana.context.close(), luis.context.close()]);
  });

  test('a second tab replaces the first, which can take the session back', async ({ browser }) => {
    const { ana, space } = await anaAndLuis(browser);
    await openOffice(ana.page, space.slug);

    const second = await ana.context.newPage();
    await openOffice(second, space.slug);

    await expect(
      ana.page.getByRole('heading', { name: 'Has abierto Bululu en otra pestaña' }),
    ).toBeVisible();
    await ana.page.getByRole('button', { name: 'Usar Bululu aquí' }).click();
    await expect(ana.page.getByTestId('world-canvas')).toHaveAttribute('data-tile-x', /^\d+$/, {
      timeout: 30_000,
    });
    await expect(
      second.getByRole('heading', { name: 'Has abierto Bululu en otra pestaña' }),
    ).toBeVisible();

    await ana.context.close();
  });

  test('"Salir" takes the avatar out for the others at once, with no reconnection grace', async ({
    browser,
  }) => {
    const { ana, luis, space } = await anaAndLuis(browser);
    await openOffice(ana.page, space.slug);
    await openOffice(luis.page, space.slug);
    await expect.poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha).toBe(1);

    await luis.page.getByRole('link', { name: 'Salir' }).click();
    await expect(luis.page).toHaveURL(/\/spaces$/);

    // Ana sees him fade out well within the 30 s grace a network cut would get.
    await expect
      .poll(async () => remoteAvatar(ana.page, luis.userId), { timeout: 5_000 })
      .toBeUndefined();

    await Promise.all([ana.context.close(), luis.context.close()]);
  });

  test('a person removed by the owner leaves the office with an explanation', async ({
    browser,
  }) => {
    const { ana, luis, space } = await anaAndLuis(browser);
    await openOffice(ana.page, space.slug);
    await openOffice(luis.page, space.slug);
    await expect.poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha).toBe(1);

    const removed = await ana.context.request.delete(
      `/api/spaces/${space.id}/members/${luis.userId}`,
      { headers: CLIENT },
    );
    expect(removed.status()).toBe(204);

    await expect(luis.page).toHaveURL(/\/spaces$/);
    await expect(luis.page.getByText('Te han expulsado de este espacio.')).toBeVisible();
    // Ana sees Luis fade out and disappear.
    await expect.poll(async () => remoteAvatar(ana.page, luis.userId)).toBeUndefined();

    await Promise.all([ana.context.close(), luis.context.close()]);
  });
});
