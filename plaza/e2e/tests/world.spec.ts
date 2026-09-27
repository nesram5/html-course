import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Development-only probes installed by `features/world/debug.ts`. */
    __plazaWorld?: { liveGames(): number; listenerCount(): number };
  }
}

/**
 * E3 smoke test: open `/s/:slug`, see the office drawn by Phaser and walk with the keyboard.
 * The space and the signed-in user are mocked at the network level (the spaces API belongs to
 * E2); the map, theme images and avatar come from the real server (`/assets/maps`).
 */
const SPACE = {
  id: 'space-e2e',
  name: 'Oficina E2E',
  slug: 'oficina-e2e',
  mapTemplateId: 'office-small@1',
  themeId: 'pixel',
  role: 'OWNER',
  thumbnailUrl: null,
  ownerId: 'user-e2e',
  allowedDomain: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  rooms: [],
  inviteUrl: null,
};

const ME = {
  id: 'user-e2e',
  email: 'e2e@plaza.local',
  displayName: 'Paseante',
  avatarId: 'avatar-02',
  avatarChosen: true,
  pictureUrl: null,
};

async function mockApi(page: Page, space: Partial<typeof SPACE> = {}): Promise<void> {
  await page.route('**/api/spaces/by-slug/oficina-e2e/enter', (route) =>
    route.fulfill({ json: { space: { ...SPACE, ...space }, joined: false } }),
  );
  await page.route('**/api/me', (route) => route.fulfill({ json: { user: ME } }));
}

async function tile(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('world-canvas');
  return {
    x: Number(await canvas.getAttribute('data-tile-x')),
    y: Number(await canvas.getAttribute('data-tile-y')),
  };
}

test.describe('2D map engine (E3)', () => {
  test('renders the office and walks with the keyboard, colliding with walls', async ({ page }) => {
    await mockApi(page);
    await page.goto('/s/oficina-e2e');

    await expect(page.getByRole('heading', { name: 'Oficina E2E' })).toBeVisible();
    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(canvas.locator('canvas')).toBeVisible();
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

    // Tab leaves the canvas for the UI.
    await canvas.focus();
    await page.keyboard.press('Tab');
    await expect(toolbar.getByRole('button', { name: 'Centrar en mí' })).toBeFocused();

    await page.screenshot({ path: 'test-results/world-office-small.png' });
  });

  test('draws the campus with its "Noche" color variant over the same geometry', async ({
    page,
  }) => {
    await mockApi(page, { mapTemplateId: 'campus@1', themeId: 'night' });
    await page.goto('/s/oficina-e2e');

    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    // Campus spawns are around the fountain: (29|34, 44|49).
    const start = await tile(page);
    expect([29, 34]).toContain(start.x);
    expect([44, 49]).toContain(start.y);

    await page.keyboard.press('ArrowLeft');
    await expect(canvas).toHaveAttribute('data-tile-x', String(start.x - 1));
    await page.screenshot({ path: 'test-results/world-campus-night.png' });
  });

  test('offers "Reintentar" when the style images fail to load', async ({ page }) => {
    await mockApi(page);
    await page.route('**/themes/pixel/below.png', (route) => route.abort());
    await page.goto('/s/oficina-e2e');

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
    await mockApi(page);
    await page.route('**/api/health', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          version: '0.0.0',
          realtime: { connectedBySpace: {}, avgTickMs: null },
        },
      }),
    );
    await page.goto('/s/oficina-e2e');
    await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => window.__plazaWorld?.liveGames())).toBe(1);
    expect(await page.evaluate(() => window.__plazaWorld?.listenerCount())).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Salir' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Plaza' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__plazaWorld?.liveGames())).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__plazaWorld?.listenerCount())).toBe(0);
  });
});
