import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { enterOffice, tile } from './support/world';

/**
 * E3 smoke test: open `/s/:slug`, see the office drawn by Phaser and walk with the keyboard.
 * Everything is real: the test signs in with the test login, chooses an avatar, creates a space
 * through the spaces API and opens it; the map, theme images and avatar come from `/assets/maps`.
 */
const CLIENT = { 'x-plaza-client': 'e2e' };

interface CreatedSpace {
  id: string;
  name: string;
  slug: string;
}

/** Signs in (sharing the page cookies), picks an avatar and creates a space of the template. */
async function createSpace(
  page: Page,
  options: { mapTemplateId?: string; themeId?: string } = {},
): Promise<CreatedSpace> {
  const run = randomUUID().slice(0, 8);
  const login = await page.request.post('/api/auth/test-login', {
    headers: CLIENT,
    data: { email: `paseante-${run}@plaza.local`, displayName: 'Paseante' },
  });
  expect(login.status()).toBe(200);
  const me = await page.request.patch('/api/me', {
    headers: CLIENT,
    data: { avatarId: 'avatar-02' },
  });
  expect(me.status()).toBe(200);
  const created = await page.request.post('/api/spaces', {
    headers: CLIENT,
    data: { name: `Oficina E2E ${run}`, mapTemplateId: options.mapTemplateId ?? 'office-small@1' },
  });
  expect(created.status()).toBe(201);
  const { space } = (await created.json()) as { space: CreatedSpace };
  if (options.themeId !== undefined) {
    const updated = await page.request.patch(`/api/spaces/${space.id}`, {
      headers: CLIENT,
      data: { themeId: options.themeId },
    });
    expect(updated.status()).toBe(200);
  }
  return space;
}

test.describe('2D map engine (E3)', () => {
  test('renders the office and walks with the keyboard, colliding with walls', async ({ page }) => {
    const space = await createSpace(page);
    await page.goto(`/s/${space.slug}`);
    await enterOffice(page);

    await expect(page.getByRole('heading', { name: space.name })).toBeVisible();
    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(canvas.locator('canvas')).toBeVisible();
    // The server decides the spawn (space:snapshot.self): the avatar appears once joined.
    await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 15_000 });
    const start = await tile(page);
    // Spawn points of office-small@1 are on row 25, columns 11..14.
    expect(start.y).toBe(25);
    expect(start.x).toBeGreaterThanOrEqual(11);
    expect(start.x).toBeLessThanOrEqual(14);

    // One tap = one tile up.
    await page.keyboard.press('ArrowUp');
    await expect(canvas).toHaveAttribute('data-tile-y', '24');
    await expect(canvas).toHaveAttribute('data-dir', 'up');

    // Holding a key walks continuously, then the bottom wall stops the avatar (it only turns).
    await page.keyboard.down('s');
    await expect(canvas).toHaveAttribute('data-tile-y', '28', { timeout: 5_000 });
    await page.waitForTimeout(400);
    await page.keyboard.up('s');
    expect(await tile(page)).toEqual({ x: start.x, y: 28 });

    // Keys typed in a text field do not move the avatar.
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'campo de prueba');
      document.body.append(input);
    });
    await page.getByLabel('campo de prueba').pressSequentially('wwaa');
    await page.waitForTimeout(300);
    expect(await tile(page)).toEqual({ x: start.x, y: 28 });
    await page.getByLabel('campo de prueba').blur();

    // Zoom with + / - and "Centrar en mí".
    const toolbar = page.getByRole('toolbar', { name: 'Controles del mapa' });
    await page.keyboard.press('+');
    await expect(toolbar.locator('output')).toHaveText('2×');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect(toolbar.locator('output')).toHaveText('1×');
    await toolbar.getByRole('button', { name: 'Centrar en mí' }).click();

    // Tab leaves the canvas for the UI over the map: the first-use hallway notice (E5-S6), the
    // bottom bar (microphone, camera, status, people, reactions, chat) and then the map controls.
    await canvas.focus();
    const bar = page.getByRole('group', { name: 'Tus controles' });
    const order = [
      page.getByRole('button', { name: 'Entendido' }),
      bar.getByRole('button', { name: 'Activar micrófono' }),
      bar.getByRole('button', { name: 'Encender cámara' }),
      bar.getByRole('button', { name: /^Estado:/ }),
      bar.getByRole('button', { name: /^Personas/ }),
      bar.getByRole('button', { name: 'Reaccionar' }),
      bar.getByRole('button', { name: 'Chat del espacio' }),
    ];
    for (const control of order) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(toolbar.getByRole('button', { name: 'Centrar en mí' })).toBeFocused();

    await page.screenshot({ path: 'test-results/world-office-small.png' });
  });

  test('draws the campus with its "Noche" color variant over the same geometry', async ({
    page,
  }) => {
    const space = await createSpace(page, { mapTemplateId: 'campus@1', themeId: 'night' });
    await page.goto(`/s/${space.slug}`);
    await enterOffice(page);

    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 15_000 });
    // Campus spawns are around the fountain: (29|34, 44|49).
    const start = await tile(page);
    expect([29, 34]).toContain(start.x);
    expect([44, 49]).toContain(start.y);

    await page.keyboard.press('ArrowLeft');
    await expect(canvas).toHaveAttribute('data-tile-x', String(start.x - 1));
    await page.screenshot({ path: 'test-results/world-campus-night.png' });
  });

  test('offers "Reintentar" when the style images fail to load', async ({ page }) => {
    const space = await createSpace(page);
    await page.route('**/themes/pixel/below.png', (route) => route.abort());
    await page.goto(`/s/${space.slug}`);
    await enterOffice(page);

    await expect(page.getByRole('alert')).toContainText(
      'No se pudieron cargar las imágenes de la oficina.',
      { timeout: 30_000 },
    );
    await page.unroute('**/themes/pixel/below.png');
    await page.getByRole('button', { name: 'Reintentar' }).click();

    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => window.__plazaWorld?.liveGames())).toBe(1);
  });

  test('leaving the page destroys the game and its listeners', async ({ page }) => {
    const space = await createSpace(page);
    await page.goto(`/s/${space.slug}`);
    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => window.__plazaWorld?.liveGames())).toBe(1);
    expect(await page.evaluate(() => window.__plazaWorld?.listenerCount())).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Salir' }).click();

    await expect(page).toHaveURL(/\/spaces$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis espacios' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__plazaWorld?.liveGames())).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__plazaWorld?.listenerCount())).toBe(0);
  });
});
