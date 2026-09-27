import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  setTabHidden,
  signIn,
  tile,
  type CreatedSpace,
} from './support/world';

/**
 * E5 hallway conversations, end to end: real server, real local LiveKit (`livekit-server --dev`)
 * and Chromium's fake camera and microphone. Two people who walk within 3 tiles see each other's
 * video; walking apart removes it; a third person far away never subscribes to anyone.
 */

interface MediaProbe {
  connection: string;
  micOn: boolean;
  cameraOn: boolean;
  peers: string[];
  subscribed: string[];
  participants: string[];
  firstFrameMs: number[];
}

declare global {
  interface Window {
    /** Development-only probe installed by `apps/web/src/features/media/debug.ts`. */
    __plazaMedia?: { state(): MediaProbe };
  }
}

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

function media(page: Page): Promise<MediaProbe | undefined> {
  return page.evaluate(() => window.__plazaMedia?.state());
}

/** The <video> of `userId` in the hallway strip of `page`. */
function videoOf(page: Page, userId: string) {
  return page.locator(`[data-testid="hallway-video"][data-user-id="${userId}"] video`);
}

/** `true` when the <video> of `userId` shows frames (the fake camera pattern). */
function playing(page: Page, userId: string): Promise<boolean> {
  return videoOf(page, userId)
    .evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0)
    .catch(() => false);
}

/** Walks along the row with the arrow keys, one tap at a time, until column `x`. */
async function walkTo(page: Page, x: number): Promise<void> {
  const canvas = page.getByTestId('world-canvas');
  await canvas.focus();
  for (let attempt = 0; attempt < 40; attempt++) {
    const before = await tile(page);
    if (before.x === x) return;
    await page.keyboard.press(before.x < x ? 'ArrowRight' : 'ArrowLeft');
    await expect(canvas).not.toHaveAttribute('data-tile-x', String(before.x));
  }
  throw new Error(`could not walk to column ${String(x)}`);
}

test.describe('hallway conversations with real media (E5)', () => {
  test('two people nearby see each other; apart, the video goes; far away, nobody subscribes', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const run = randomUUID().slice(0, 8);
    const eva = await person(browser, `eva-${run}@acme.com`, 'Eva');
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const space: CreatedSpace = await createSpace(eva.context.request, `Pasillo ${run}`);
    await joinByInvite(ana.context.request, space);
    await joinByInvite(luis.context.request, space);

    // Eva arrives first (spawn 11,25) and walks far away along row 25 before anyone else comes.
    await openOffice(eva.page, space.slug, { media: true });
    await walkTo(eva.page, 26);
    expect(await tile(eva.page)).toEqual({ x: 26, y: 25 });

    // Ana (12,25) and Luis (13,25) spawn one tile apart: a hallway conversation.
    await openOffice(ana.page, space.slug, { media: true });
    // RN-12: first-use notice.
    await expect(ana.page.getByRole('note')).toContainText(
      'Las charlas de pasillo no son privadas; para hablar en privado, entra en una sala',
    );
    await ana.page.getByRole('button', { name: 'Entendido' }).click();
    await openOffice(luis.page, space.slug, { media: true });
    await expect.poll(async () => (await media(ana.page))?.connection).toBe('connected');
    await expect.poll(async () => (await media(ana.page))?.cameraOn).toBe(true);

    await expect(videoOf(ana.page, luis.userId)).toBeVisible({ timeout: 5000 });
    await expect.poll(() => playing(ana.page, luis.userId), { timeout: 5000 }).toBe(true);
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 5000 }).toBe(true);
    // Everyone sees the 💬 over them, also Eva far away.
    await expect
      .poll(async () => (await remoteAvatar(eva.page, ana.userId))?.inConversation)
      .toBe(true);
    await ana.page.screenshot({ path: 'test-results/hallway-two-people.png' });

    // Luis walks away: at 5 tiles the conversation ends and the videos go.
    await walkTo(luis.page, 17);
    expect(await tile(luis.page)).toEqual({ x: 17, y: 25 });
    await expect(videoOf(ana.page, luis.userId)).toHaveCount(0, { timeout: 5000 });
    await expect(videoOf(luis.page, ana.userId)).toHaveCount(0, { timeout: 5000 });
    await expect.poll(async () => (await media(ana.page))?.subscribed).toEqual([]);
    await expect
      .poll(async () => (await remoteAvatar(eva.page, ana.userId))?.inConversation)
      .toBe(false);

    // He comes back to 3 tiles: the video is back within 5 s.
    await walkTo(luis.page, 15);
    expect(await tile(luis.page)).toEqual({ x: 15, y: 25 });
    const back = Date.now();
    await expect.poll(() => playing(ana.page, luis.userId), { timeout: 5000 }).toBe(true);
    expect(Date.now() - back).toBeLessThan(5000);
    // The time from media:peers to the first frame was measured (Sentry metric, E5-S5).
    expect((await media(ana.page))?.firstFrameMs.length).toBeGreaterThan(0);

    // Eva, far away the whole time, never subscribed to anyone nor was subscribed to.
    expect(await media(eva.page)).toMatchObject({ connection: 'connected', subscribed: [] });
    expect((await media(eva.page))?.peers).toEqual([]);
    expect((await media(ana.page))?.subscribed).not.toContain(eva.userId);
    expect((await media(luis.page))?.subscribed).not.toContain(eva.userId);
    await expect(eva.page.getByTestId('hallway-video')).toHaveCount(0);

    for (const someone of [ana, luis, eva]) await someone.context.close();
  });

  test('the bottom bar mutes the microphone and turns the camera off for the others', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const space = await createSpace(ana.context.request, `Controles ${run}`);
    await joinByInvite(luis.context.request, space);
    await openOffice(ana.page, space.slug, { media: true });
    await openOffice(luis.page, space.slug, { media: true });
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 10_000 }).toBe(true);

    await ana.page.getByRole('button', { name: 'Silenciar micrófono' }).click();
    await ana.page.getByTestId('world-canvas').focus();
    await ana.page.keyboard.press('Control+e');

    await expect(ana.page.getByRole('button', { name: 'Activar micrófono' })).toBeVisible();
    await expect(ana.page.getByRole('button', { name: 'Encender cámara' })).toBeVisible();
    const anaTile = luis.page.locator(
      `[data-testid="hallway-video"][data-user-id="${ana.userId}"]`,
    );
    await expect(anaTile.getByRole('img', { name: 'Micrófono silenciado' })).toBeVisible({
      timeout: 5000,
    });
    await expect(anaTile.locator('video')).toBeHidden({ timeout: 5000 });

    for (const someone of [ana, luis]) await someone.context.close();
  });

  test('away (hidden tab) mutes microphone and camera, shows "Ausente · Llamar" and restores on return (E5 × E7)', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const space = await createSpace(ana.context.request, `Ausente ${run}`);
    await joinByInvite(luis.context.request, space);
    await openOffice(ana.page, space.slug, { media: true });
    await openOffice(luis.page, space.slug, { media: true });
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 10_000 }).toBe(true);
    const anaTile = luis.page.locator(
      `[data-testid="hallway-video"][data-user-id="${ana.userId}"]`,
    );

    // Ana's tab is hidden: presence marks her away and the media feature mutes her.
    await setTabHidden(ana.page, true);
    await expect
      .poll(async () => {
        const state = await media(ana.page);
        return [state?.micOn, state?.cameraOn];
      })
      .toEqual([false, false]);
    await expect(anaTile.getByRole('img', { name: 'Micrófono silenciado' })).toBeVisible({
      timeout: 5000,
    });
    const card = anaTile.getByRole('group', { name: 'Ana está ausente' });
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.getByRole('button', { name: /Llamar/ })).toBeVisible();

    // Back: exactly what was on comes back (microphone and camera), and the card goes.
    await setTabHidden(ana.page, false);
    await expect
      .poll(async () => {
        const state = await media(ana.page);
        return [state?.micOn, state?.cameraOn];
      })
      .toEqual([true, true]);
    await expect(card).toBeHidden({ timeout: 5000 });
    await expect(anaTile.getByRole('img', { name: 'Micrófono silenciado' })).toBeHidden({
      timeout: 5000,
    });
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 10_000 }).toBe(true);

    for (const someone of [ana, luis]) await someone.context.close();
  });

  test('choosing "Ocupado" leaves the hallway conversation; "Disponible" joins it again (E5 × E7)', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const space = await createSpace(ana.context.request, `Ocupada ${run}`);
    await joinByInvite(luis.context.request, space);
    await openOffice(ana.page, space.slug, { media: true });
    await openOffice(luis.page, space.slug, { media: true });
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 10_000 }).toBe(true);
    const bar = ana.page.getByRole('group', { name: 'Tus controles' });

    await bar.getByRole('button', { name: 'Estado: Disponible' }).click();
    await ana.page.getByRole('menuitemradio', { name: /Ocupado/ }).click();
    await expect.poll(async () => (await media(luis.page))?.peers, { timeout: 5000 }).toEqual([]);
    await expect(videoOf(luis.page, ana.userId)).toHaveCount(0, { timeout: 5000 });
    expect((await media(ana.page))?.subscribed).toEqual([]);

    await bar.getByRole('button', { name: 'Estado: Ocupado' }).click();
    await ana.page.getByRole('menuitemradio', { name: /Disponible/ }).click();
    await expect.poll(() => playing(luis.page, ana.userId), { timeout: 10_000 }).toBe(true);

    for (const someone of [ana, luis]) await someone.context.close();
  });
});
