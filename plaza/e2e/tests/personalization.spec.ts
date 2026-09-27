import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { frontOf, loadMap, office, pathTo, walk, type DeskRect, type Tile } from './support/office';
import {
  CLIENT,
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  signIn,
  tile,
  type CreatedSpace,
} from './support/world';

/**
 * E9 personalization, end to end with two people (two browser contexts): the owner changes the
 * office style and the other person sees it change live; a member claims and decorates a desk
 * and the other person sees the name and the objects.
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

async function anaAndLuis(browser: Browser) {
  const run = randomUUID().slice(0, 8);
  const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
  const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
  const space: CreatedSpace = await createSpace(ana.context.request, `Personal ${run}`);
  await joinByInvite(luis.context.request, space);
  return { ana, luis, space };
}

function touches(desk: DeskRect, at: Tile): boolean {
  const dx = at.x < desk.x ? desk.x - at.x : Math.max(0, at.x - (desk.x + desk.width - 1));
  const dy = at.y < desk.y ? desk.y - at.y : Math.max(0, at.y - (desk.y + desk.height - 1));
  return Math.max(dx, dy) === 1;
}

/** Walks down into the bottom wall and back: the same route must end on the same tiles. */
async function bumpIntoTheBottomWall(page: Page): Promise<Tile[]> {
  const canvas = page.getByTestId('world-canvas');
  await canvas.focus();
  const visited: Tile[] = [];
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(160);
    visited.push(await tile(page));
  }
  for (const key of ['ArrowUp', 'ArrowUp']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(160);
    visited.push(await tile(page));
  }
  return visited;
}

test.describe('office personalization (E9)', () => {
  // Two people, several page loads and walks per test.
  test.describe.configure({ timeout: 120_000 });

  test('the owner changes the style and the other person sees it live, nobody moves', async ({
    browser,
  }) => {
    const { ana, luis, space } = await anaAndLuis(browser);
    const map = await loadMap(luis.context.request, 'office-small');
    await openOffice(ana.page, space.slug);
    const luisStart = await openOffice(luis.page, space.slug);
    await expect.poll(async () => (await remoteAvatar(luis.page, ana.userId))?.alpha).toBe(1);
    const anaSeen = await remoteAvatar(luis.page, ana.userId);
    expect((await office(luis.page))?.themeId).toBe('pixel');

    // Same route in the pixel style…
    const pixelRoute = await bumpIntoTheBottomWall(luis.page);

    // Ana opens the settings in another tab: the "Estilo" section with its thumbnails.
    const settings = await ana.context.newPage();
    await settings.goto(`/spaces/${space.id}/settings`);
    const section = settings.getByRole('region', { name: 'Estilo' });
    await expect(section.getByRole('img')).toHaveCount(3);
    await section.getByRole('radio', { name: /Acuarela/ }).check();
    await section.getByRole('button', { name: 'Aplicar estilo' }).click();
    const started = Date.now();

    // Luis sees the watercolor style fade in within 2 s, without reloading.
    await expect
      .poll(
        async () => {
          const probe = await office(luis.page);
          return probe && { themeId: probe.themeId, swaps: probe.swaps };
        },
        { timeout: 2_000, intervals: [50] },
      )
      .toEqual({ themeId: 'watercolor', swaps: 1 });
    expect(Date.now() - started).toBeLessThan(2_000);
    await expect(settings.getByText('Estilo «Acuarela» aplicado.')).toBeVisible();

    // The old textures are gone; only the new style is loaded.
    const probe = await office(luis.page);
    expect(probe?.styleTextures.sort()).toEqual(['theme:1:above', 'theme:1:below']);
    // Nobody moved.
    expect(await tile(luis.page)).toEqual(pixelRoute.at(-1));
    expect(await remoteAvatar(luis.page, ana.userId)).toMatchObject({
      tileX: anaSeen?.tileX,
      tileY: anaSeen?.tileY,
    });

    // …and the same route ends on the same tiles in the watercolor style (same collisions).
    await walk(luis.page, pathTo(map, await tile(luis.page), [luisStart]) ?? []);
    expect(await tile(luis.page)).toEqual(luisStart);
    expect(await bumpIntoTheBottomWall(luis.page)).toEqual(pixelRoute);

    // Whoever enters later gets the new style directly.
    await openOffice(luis.page, space.slug);
    await expect.poll(async () => (await office(luis.page))?.themeId).toBe('watercolor');
    expect((await office(luis.page))?.swaps).toBe(0);

    await luis.page.screenshot({ path: 'test-results/office-watercolor.png' });
    await ana.context.close();
    await luis.context.close();
  });

  test('a member claims and decorates a desk; the other person sees the name and the objects', async ({
    browser,
  }) => {
    const { ana, luis, space } = await anaAndLuis(browser);
    const map = await loadMap(luis.context.request, 'office-small');
    await openOffice(ana.page, space.slug);
    const start = await openOffice(luis.page, space.slug);

    // Luis walks to the nearest desk and presses X.
    const paths = map.desks
      .map((desk) => pathTo(map, start, frontOf(desk)))
      .filter((path): path is Tile[] => path !== null)
      .sort((a, b) => a.length - b.length);
    const route = paths[0];
    expect(route).toBeDefined();
    await walk(luis.page, route ?? []);
    await luis.page.keyboard.press('x');
    const menu = luis.page.getByRole('dialog', { name: 'Escritorio libre' });
    await expect(menu).toBeVisible();
    const deskId = (await menu.getAttribute('data-desk')) ?? '';
    const desk = map.desks.find((d) => d.deskId === deskId);
    expect(desk).toBeDefined();
    await menu.getByRole('button', { name: 'Reclamar este escritorio' }).click();
    await expect(luis.page.getByText('Este escritorio ya es tuyo.')).toBeVisible();

    // Ana sees Luis's name over the desk.
    await expect
      .poll(async () => (await office(ana.page))?.desks)
      .toEqual([{ deskId, label: 'Luis', items: [] }]);

    // Luis decorates it with the keyboard: X → "Decorar", a plant in slot 1, a lamp in slot 2.
    await luis.page.getByTestId('world-canvas').focus();
    await luis.page.keyboard.press('x');
    await luis.page
      .getByRole('dialog', { name: 'Tu escritorio' })
      .getByRole('button', {
        name: 'Decorar',
      })
      .press('Enter');
    const panel = luis.page.getByRole('dialog', { name: 'Decorar mi escritorio' });
    await expect(panel.getByRole('button', { name: 'Hueco 1: vacío' })).toBeFocused();
    await panel.getByRole('button', { name: 'Planta', exact: true }).press('Enter');
    await panel.getByRole('button', { name: 'Hueco 2: vacío' }).press('Enter');
    await panel.getByRole('button', { name: 'Lámpara', exact: true }).press('Enter');
    // Live preview on Luis's own map before saving.
    await expect
      .poll(async () => (await office(luis.page))?.desks[0]?.items)
      .toEqual(['plant', 'lamp']);
    expect((await office(ana.page))?.desks[0]?.items).toEqual([]);
    await panel.getByRole('button', { name: 'Guardar' }).click();
    const saved = Date.now();

    // Ana sees the objects in less than a second.
    await expect
      .poll(async () => (await office(ana.page))?.desks[0]?.items, {
        timeout: 1_000,
        intervals: [50],
      })
      .toEqual(['plant', 'lamp']);
    expect(Date.now() - saved).toBeLessThan(1_000);

    // "Mi escritorio" takes Luis back next to his desk from anywhere.
    await walk(luis.page, (pathTo(map, await tile(luis.page), [start]) ?? []).slice(0, 3));
    await luis.page.getByRole('button', { name: 'Mi escritorio' }).click();
    await expect
      .poll(async () => desk !== undefined && touches(desk, await tile(luis.page)))
      .toBe(true);
    const deskTile = await tile(luis.page);

    // The objects survive a style change, and the next day Luis enters next to his desk.
    const patched = await ana.context.request.patch(`/api/spaces/${space.id}`, {
      headers: CLIENT,
      data: { themeId: 'night' },
    });
    expect(patched.status()).toBe(200);
    await expect.poll(async () => (await office(ana.page))?.themeId).toBe('night');
    expect((await office(ana.page))?.desks).toEqual([
      { deskId, label: 'Luis', items: ['plant', 'lamp'] },
    ]);
    await luis.page.reload();
    await expect(luis.page.getByTestId('world-canvas')).toHaveAttribute('data-tile-x', /^\d+$/, {
      timeout: 15_000,
    });
    expect(await tile(luis.page)).toEqual(deskTile);
    await expect
      .poll(async () => (await office(luis.page))?.desks)
      .toEqual([{ deskId, label: 'Luis', items: ['plant', 'lamp'] }]);

    await ana.page.screenshot({ path: 'test-results/office-desk-decorated.png' });
    await ana.context.close();
    await luis.context.close();
  });
});
