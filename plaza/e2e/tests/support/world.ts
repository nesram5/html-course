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
        desks: { deskId: string; label: string; items: string[] }[];
      } | null;
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
