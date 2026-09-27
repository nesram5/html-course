import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** An avatar as reported by the development probe `window.__plazaWorld.avatars()`. */
export interface AvatarProbe {
  /** `null` for the local avatar. */
  userId: string | null;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  alpha: number;
  moving: boolean;
  labelAboveArt: boolean;
  /** Status dot (E7-S1). */
  presence: 'available' | 'busy' | 'away';
  /** Emoji over the avatar right now (E7-S4). */
  reaction: string | null;
  /** The 💬 of a hallway conversation is drawn next to the name (E5-S2). */
  inConversation: boolean;
  /** The 📹 of a meeting room is drawn next to the name (E6-S4). */
  inMeeting: boolean;
}

declare global {
  interface Window {
    /** Development-only probes installed by `apps/web/src/features/world/debug.ts`. */
    __plazaWorld?: {
      liveGames(): number;
      listenerCount(): number;
      avatars(): AvatarProbe[];
      cameraTarget(): string | null;
      fps(): number;
      realtime(): { connection: string; session: string };
      stress(count: number): void;
      dropConnection(): void;
      /** Office style and drawn desks (E9), `null` without a running scene. */
      office(): {
        themeId: string;
        swaps: number;
        styleTextures: string[];
        preloaded: string[];
        desks: { deskId: string; label: string; items: string[] }[];
        shownDesk: string | null;
      } | null;
      /** Meeting rooms and whether they are drawn as occupied (E6-S4). */
      rooms(): { areaId: string; occupied: boolean; people: number }[];
    };
  }
}

export const CLIENT = { 'x-plaza-client': 'e2e' };

/** Test login + avatar; returns the user id. */
export async function signIn(
  request: APIRequestContext,
  email: string,
  displayName: string,
): Promise<string> {
  const login = await request.post('/api/auth/test-login', {
    headers: CLIENT,
    data: { email, displayName },
  });
  expect(login.status()).toBe(200);
  const me = await request.patch('/api/me', { headers: CLIENT, data: { avatarId: 'avatar-02' } });
  expect(me.status()).toBe(200);
  return ((await me.json()) as { user: { id: string } }).user.id;
}

export interface CreatedSpace {
  id: string;
  name: string;
  slug: string;
  inviteUrl: string;
}

export async function createSpace(
  request: APIRequestContext,
  name: string,
  mapTemplateId = 'office-small@1',
): Promise<CreatedSpace> {
  const created = await request.post('/api/spaces', {
    headers: CLIENT,
    data: { name, mapTemplateId },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { space: CreatedSpace }).space;
}

/** Joins a space through its invitation link (API). */
export async function joinByInvite(request: APIRequestContext, space: CreatedSpace): Promise<void> {
  const token = new URL(space.inviteUrl).pathname.split('/').pop() ?? '';
  expect((await request.post(`/api/join/${token}`, { headers: CLIENT })).status()).toBe(200);
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Tile offset of each arrow key. */
export const STEP_OF: Readonly<Record<ArrowKey, { x: number; y: number }>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * One tap of an arrow key, as `keydown` and `keyup` in the same task of the page: exactly one
 * tile however loaded the machine is (with `keyboard.press`, a busy page may see the key held
 * past one step and walk two tiles).
 */
export async function tapKey(page: Page, key: ArrowKey): Promise<void> {
  await page.evaluate((code) => {
    const target = document.activeElement ?? document.body;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true }));
    }
  }, key);
}

/** Someone else's page: a step counts as confirmed by the server once they see it there. */
export interface Observer {
  page: Page;
  /** The walker, as the observer's page knows them. */
  userId: string;
}

/**
 * One tile with the keyboard: taps `key`, waits for the local avatar to be on `expected`
 * (the tile the key leads to, or the current one when blocked) and, with `seenBy`, for the other
 * page to draw the avatar there too, i.e. for the server to have accepted the step.
 */
export async function step(
  page: Page,
  key: ArrowKey,
  options: { expected?: { x: number; y: number }; seenBy?: Observer } = {},
): Promise<{ x: number; y: number }> {
  // Read the tile and tap in one round trip, then wait in the page (one more).
  const at = await page.evaluate((code) => {
    const canvas = document.querySelector('[data-testid="world-canvas"]');
    const from = {
      x: Number(canvas?.getAttribute('data-tile-x')),
      y: Number(canvas?.getAttribute('data-tile-y')),
    };
    const target = document.activeElement ?? document.body;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true }));
    }
    return from;
  }, key);
  const expected = options.expected ?? { x: at.x + STEP_OF[key].x, y: at.y + STEP_OF[key].y };
  await page.waitForFunction(
    (goal) => {
      const canvas = document.querySelector('[data-testid="world-canvas"]');
      return (
        canvas?.getAttribute('data-tile-x') === String(goal.x) &&
        canvas.getAttribute('data-tile-y') === String(goal.y)
      );
    },
    expected,
    { polling: 'raf', timeout: 5000 },
  );
  if (options.seenBy !== undefined) await expectSeenAt(options.seenBy, expected);
  return expected;
}

/** Waits until the observer's page draws the walker, still, on `at` (server-confirmed). */
export async function expectSeenAt(
  observer: Observer,
  at: { x: number; y: number },
): Promise<void> {
  await expect
    .poll(async () => {
      const seen = await remoteAvatar(observer.page, observer.userId);
      return seen && { x: seen.tileX, y: seen.tileY };
    })
    .toEqual(at);
}

/**
 * Walks along the current row to column `x`. Long stretches hold the arrow key and let go two
 * tiles before the goal (the game walks a tile every 120 ms by itself, with no round trip per
 * tile, which matters on a loaded machine); the last tiles, and any overshoot, are single
 * confirmed taps. With `seenBy`, the final tile is also confirmed by the server (another page
 * draws the avatar there).
 */
export async function walkToColumn(page: Page, x: number, seenBy?: Observer): Promise<void> {
  await page.getByTestId('world-canvas').focus();
  const start = await tile(page);
  const direction = Math.sign(x - start.x);
  if (Math.abs(x - start.x) > 3) {
    const key: ArrowKey = direction > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(
        ({ release, dir }) => {
          const canvas = document.querySelector('[data-testid="world-canvas"]');
          const at = Number(canvas?.getAttribute('data-tile-x'));
          return dir > 0 ? at >= release : at <= release;
        },
        { release: x - 2 * direction, dir: direction },
        { polling: 'raf', timeout: 30_000 },
      );
    } finally {
      await page.keyboard.up(key);
    }
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const at = await tile(page);
    if (at.x === x) {
      if (seenBy !== undefined) await expectSeenAt(seenBy, at);
      return;
    }
    await step(page, at.x < x ? 'ArrowRight' : 'ArrowLeft');
  }
  throw new Error(`could not walk to column ${String(x)}`);
}

/** Tile of the local avatar, from the canvas data attributes. */
export async function tile(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('world-canvas');
  return {
    x: Number(await canvas.getAttribute('data-tile-x')),
    y: Number(await canvas.getAttribute('data-tile-y')),
  };
}

export interface EnterOptions {
  /** Enter with camera and microphone (fake devices); without media by default. */
  media?: boolean;
}

/**
 * Passes the media pre-join (E5-S4) shown before entering the office. Without `media`, camera
 * and microphone are switched off first, so tests that do not need them stay light.
 */
export async function enterOffice(page: Page, options: EnterOptions = {}): Promise<void> {
  const prejoin = page.getByTestId('prejoin');
  await expect(prejoin).toBeVisible({ timeout: 30_000 });
  for (const name of ['Cámara activada', 'Micrófono activado']) {
    await prejoin.getByRole('checkbox', { name }).setChecked(options.media === true);
  }
  await prejoin.getByRole('button', { name: /^Entrar/ }).click();
  await expect(prejoin).toHaveCount(0);
}

/**
 * Opens `/s/:slug`, passes the pre-join and waits for the office drawn AND joined (the avatar
 * has a tile).
 */
export async function openOffice(
  page: Page,
  slug: string,
  options: EnterOptions = {},
): Promise<{ x: number; y: number }> {
  await page.goto(`/s/${slug}`);
  await enterOffice(page, options);
  const canvas = page.getByTestId('world-canvas');
  await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 15_000 });
  return tile(page);
}

export function avatars(page: Page): Promise<AvatarProbe[]> {
  return page.evaluate(() => window.__plazaWorld?.avatars() ?? []);
}

/** The remote avatar of `userId` drawn in `page`, if any. */
export async function remoteAvatar(page: Page, userId: string): Promise<AvatarProbe | undefined> {
  return (await avatars(page)).find((avatar) => avatar.userId === userId);
}

/** Makes the page believe its tab was hidden (or shown again). */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
