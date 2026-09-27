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
  /** The 💬 of a hallway conversation is drawn over the avatar (E5-S2). */
  inConversation: boolean;
}

declare global {
  interface Window {
    /** Development-only probes installed by `apps/web/src/features/world/debug.ts`. */
    __plazaWorld?: {
      liveGames(): number;
      listenerCount(): number;
      avatars(): AvatarProbe[];
      fps(): number;
      realtime(): { connection: string; session: string };
      stress(count: number): void;
      dropConnection(): void;
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

/** Opens `/s/:slug` and waits for the office drawn AND joined (the avatar has a tile). */
export async function openOffice(page: Page, slug: string): Promise<{ x: number; y: number }> {
  await page.goto(`/s/${slug}`);
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
