import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  CLIENT,
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  signIn,
  tile,
} from './support/world';

/**
 * E6 meeting rooms, end to end: real server, real local LiveKit and Chromium's fake camera and
 * microphone. Ana and Eva talk in the hallway; Eva walks into the meeting room: Ana stops
 * receiving her within a second, Eva gets the room card with the Meet link (the popup is
 * intercepted, the real Meet is never loaded) and her Plaza media is off; walking out restores
 * the hallway conversation with the media she had.
 *
 * office-small@1: spawns (11..14, 25); columns 11 and 12 are free up to row 7; row 7 is free up to
 * (27,7) and (28,7) is the first tile of "Sala de reuniones".
 */

const MEET_URI = 'https://meet.google.com/abc-defg-hij';
const ROOM_ID = 'sala-reuniones';

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

function media(page: Page) {
  return page.evaluate(() => window.__plazaMedia?.state());
}

/** One arrow-key step; waits until the avatar is on the next tile. */
async function step(page: Page, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
  const canvas = page.getByTestId('world-canvas');
  const before = await tile(page);
  await page.keyboard.press(key);
  await expect
    .poll(async () => {
      const now = await tile(page);
      return now.x !== before.x || now.y !== before.y;
    })
    .toBe(true);
  await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/);
}

/** Walks up (or down) to row `y`, then along the row to column `x`. */
async function walkTo(page: Page, target: { x: number; y: number }): Promise<void> {
  await page.getByTestId('world-canvas').focus();
  for (let attempt = 0; attempt < 80; attempt++) {
    const at = await tile(page);
    if (at.x === target.x && at.y === target.y) return;
    if (at.y !== target.y) await step(page, at.y > target.y ? 'ArrowUp' : 'ArrowDown');
    else await step(page, at.x < target.x ? 'ArrowRight' : 'ArrowLeft');
  }
  throw new Error(`could not walk to ${String(target.x)},${String(target.y)}`);
}

/** `true` when the <video> of `userId` in the hallway strip shows frames. */
function playing(page: Page, userId: string): Promise<boolean> {
  return page
    .locator(`[data-testid="hallway-video"][data-user-id="${userId}"] video`)
    .evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0)
    .catch(() => false);
}

/** `true` when an <audio> element plays the microphone of `userId`. */
function hearing(page: Page, userId: string): Promise<boolean> {
  return page.evaluate(
    (id) => document.querySelector(`audio[data-plaza-audio="${id}"]`) !== null,
    userId,
  );
}

test.describe('meeting rooms with Google Meet (E6)', () => {
  test('walking into a room cuts the hallway, offers the Meet and turns Plaza media off; walking out restores it', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const eva = await person(browser, `eva-${run}@acme.com`, 'Eva');
    const space = await createSpace(ana.context.request, `Salas ${run}`);
    await joinByInvite(eva.context.request, space);
    const linked = await ana.context.request.put(`/api/spaces/${space.id}/rooms/${ROOM_ID}`, {
      headers: CLIENT,
      data: { meetUri: MEET_URI },
    });
    expect(linked.status()).toBe(200);

    // Ana (11,25) and Eva (12,25) walk up to row 7 and along it to the door of the room.
    await openOffice(ana.page, space.slug, { media: true });
    await openOffice(eva.page, space.slug, { media: true });
    for (const someone of [ana, eva]) {
      const dismiss = someone.page.getByRole('button', { name: 'Entendido' });
      if (await dismiss.isVisible()) await dismiss.click();
    }
    await walkTo(eva.page, { x: 12, y: 7 });
    await walkTo(eva.page, { x: 27, y: 7 });
    await walkTo(ana.page, { x: 11, y: 7 });
    await walkTo(ana.page, { x: 25, y: 7 });

    // A hallway conversation: each one sees and hears the other.
    await expect.poll(() => playing(ana.page, eva.userId), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => hearing(ana.page, eva.userId), { timeout: 5000 }).toBe(true);
    await expect.poll(() => playing(eva.page, ana.userId), { timeout: 5000 }).toBe(true);
    expect(await media(eva.page)).toMatchObject({ micOn: true, cameraOn: true });

    // Eva steps into the meeting room: within 1 s Ana no longer receives her audio or video.
    // Both moments are taken inside the browsers (same clock), without the test runner's lag.
    await ana.page.evaluate((id) => {
      const probe = window as unknown as { __cutAt: number | null };
      probe.__cutAt = null;
      const check = () => {
        const cut =
          document.querySelector(`audio[data-plaza-audio="${id}"]`) === null &&
          document.querySelector(`[data-testid="hallway-video"][data-user-id="${id}"]`) === null &&
          !(window.__plazaMedia?.state().subscribed ?? []).includes(id);
        if (cut) probe.__cutAt = Date.now();
        else setTimeout(check, 10);
      };
      check();
    }, eva.userId);
    expect(await ana.page.evaluate(() => (window as unknown as { __cutAt: null }).__cutAt)).toBe(
      null,
    );
    await eva.page.evaluate(() => {
      const probe = window as unknown as { __steppedAt: number | null };
      probe.__steppedAt = null;
      window.addEventListener(
        'keydown',
        () => {
          probe.__steppedAt ??= Date.now();
        },
        { capture: true, once: true },
      );
    });
    await eva.page.getByTestId('world-canvas').focus();
    await eva.page.keyboard.press('ArrowRight');
    await expect
      .poll(() => ana.page.evaluate(() => (window as unknown as { __cutAt: number }).__cutAt), {
        timeout: 5000,
      })
      .not.toBeNull();
    const cutAt = await ana.page.evaluate(() => (window as unknown as { __cutAt: number }).__cutAt);
    const steppedAt = await eva.page.evaluate(
      () => (window as unknown as { __steppedAt: number }).__steppedAt,
    );
    expect(cutAt - steppedAt).toBeLessThan(1000);
    expect(await tile(eva.page)).toEqual({ x: 28, y: 7 });

    // Eva: the room card, no hallway peers, Plaza microphone and camera off and disabled.
    const card = eva.page.getByRole('region', { name: 'Sala de reuniones' });
    await expect(card).toContainText('Estás en Sala de reuniones · 1 persona dentro');
    await expect.poll(async () => (await media(eva.page))?.peers).toEqual([]);
    await expect
      .poll(async () => {
        const state = await media(eva.page);
        return [state?.micOn, state?.cameraOn];
      })
      .toEqual([false, false]);
    await expect(eva.page.getByRole('button', { name: 'Activar micrófono' })).toBeDisabled();
    await expect(eva.page.getByRole('button', { name: 'Encender cámara' })).toBeDisabled();

    // Ana sees the room tinted as occupied and the 📹 next to Eva; "Personas" says where she is.
    await expect
      .poll(() => ana.page.evaluate(() => window.__plazaWorld?.rooms()))
      .toEqual([{ areaId: ROOM_ID, occupied: true, people: 1 }]);
    await expect.poll(async () => (await remoteAvatar(ana.page, eva.userId))?.inMeeting).toBe(true);
    await ana.page
      .getByRole('group', { name: 'Tus controles' })
      .getByRole('button', { name: /Personas/ })
      .click();
    await expect(ana.page.getByTestId(`person-${eva.userId}`)).toContainText(
      'En Sala de reuniones',
    );
    await ana.page.keyboard.press('Escape');

    // "Unirse a la reunión" opens the Meet in a new tab without opener (intercepted here) and
    // records room_meet_opened.
    await eva.page.evaluate(() => {
      const opened: unknown[][] = [];
      (window as unknown as { __opened: unknown[][] }).__opened = opened;
      window.open = (...args: unknown[]) => {
        opened.push(args);
        return null;
      };
    });
    const tracked = eva.page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/events'),
    );
    await card.getByRole('button', { name: /Unirse a la reunión/ }).click();
    expect(
      await eva.page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened),
    ).toEqual([[MEET_URI, '_blank', 'noopener,noreferrer']]);
    expect((await tracked).postDataJSON()).toEqual({
      name: 'room_meet_opened',
      props: { areaId: ROOM_ID },
    });
    expect(await media(eva.page)).toMatchObject({ micOn: false, cameraOn: false });
    // Still nothing reaches the hallway.
    expect(await hearing(ana.page, eva.userId)).toBe(false);

    // Eva walks back out: the card goes, her microphone and camera come back as they were and the
    // hallway conversation resumes.
    await eva.page.getByTestId('world-canvas').focus();
    await step(eva.page, 'ArrowLeft');
    await expect(card).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const state = await media(eva.page);
          return [state?.micOn, state?.cameraOn];
        },
        { timeout: 10_000 },
      )
      .toEqual([true, true]);
    await expect.poll(() => playing(ana.page, eva.userId), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => hearing(ana.page, eva.userId), { timeout: 10_000 }).toBe(true);
    await expect
      .poll(() => ana.page.evaluate(() => window.__plazaWorld?.rooms()))
      .toEqual([{ areaId: ROOM_ID, occupied: false, people: 0 }]);
    await expect(eva.page.getByRole('button', { name: 'Silenciar micrófono' })).toBeEnabled();

    for (const someone of [ana, eva]) await someone.context.close();
  });
});
