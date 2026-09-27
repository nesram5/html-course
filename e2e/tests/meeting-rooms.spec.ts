import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { expectAccessible } from './support/a11y';
import {
  CLIENT,
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  signIn,
  step,
  tapKey,
  tile,
  type ArrowKey,
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
/** The admin of the metrics page (`ADMIN_EMAILS` of the E2E server). */
const ADMIN = 'producto@plaza.test';

/** O6 of the admin metrics page (E8-S7): room entries and Meet openings. */
async function o6(
  request: APIRequestContext,
): Promise<{ roomEntries: number; meetOpened: number }> {
  const response = await request.get('/api/admin/metrics?days=7');
  expect(response.status()).toBe(200);
  const { o6: figures } = (await response.json()) as {
    o6: { roomEntries: number; meetOpened: number };
  };
  return { roomEntries: figures.roomEntries, meetOpened: figures.meetOpened };
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

function media(page: Page) {
  return page.evaluate(() => window.__plazaMedia?.state());
}

/**
 * Walks up (or down) to row `y`, then along the row to column `x`, inside the page: each tap as
 * soon as the previous step has started, without a round trip to the test runner per tile.
 */
async function walkTo(page: Page, target: { x: number; y: number }): Promise<void> {
  await page.getByTestId('world-canvas').focus();
  await page.evaluate(async (goal) => {
    const canvas = document.querySelector('[data-testid="world-canvas"]');
    const at = () => ({
      x: Number(canvas?.getAttribute('data-tile-x')),
      y: Number(canvas?.getAttribute('data-tile-y')),
    });
    for (let taps = 0; taps < 80; taps++) {
      const from = at();
      if (from.x === goal.x && from.y === goal.y) return;
      const code =
        from.y !== goal.y
          ? from.y > goal.y
            ? 'ArrowUp'
            : 'ArrowDown'
          : from.x < goal.x
            ? 'ArrowRight'
            : 'ArrowLeft';
      const target = document.activeElement ?? document.body;
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true }));
      }
      const started = performance.now();
      while (performance.now() - started < 2000) {
        const now = at();
        if (now.x !== from.x || now.y !== from.y) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }, target);
  expect(await tile(page)).toEqual(target);
}

/**
 * Walks back and forth along a room's border like someone hesitating at the door: one tap every
 * `gapMs` (each tap is its own step: the next one waits until the previous step has started), all
 * inside the page, with no round trip to the test runner and no wait for the server.
 */
async function dither(page: Page, keys: readonly ArrowKey[], gapMs = 200): Promise<void> {
  await page.evaluate(
    async ({ codes, gap }) => {
      const canvas = document.querySelector('[data-testid="world-canvas"]');
      const at = () =>
        `${String(canvas?.getAttribute('data-tile-x'))},${String(canvas?.getAttribute('data-tile-y'))}`;
      for (const code of codes) {
        const from = at();
        const target = document.activeElement ?? document.body;
        for (const type of ['keydown', 'keyup']) {
          target.dispatchEvent(new KeyboardEvent(type, { key: code, code, bubbles: true }));
        }
        const tapped = performance.now();
        while (
          (at() === from && performance.now() - tapped < 2000) ||
          performance.now() - tapped < gap
        ) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
    },
    { codes: keys, gap: gapMs },
  );
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
    const admin = await browser.newContext();
    await signIn(admin.request, ADMIN, 'Producto');
    const before = await o6(admin.request);
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
    await tapKey(eva.page, 'ArrowRight');
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
    await expectAccessible(eva.page, 'the office inside a meeting room');

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
    // Both halves of O6 reach the admin metrics page: the entry (recorded by the server) and the
    // Meet opened (reported by the client).
    await expect
      .poll(() => o6(admin.request), { timeout: 10_000 })
      .toEqual({ roomEntries: before.roomEntries + 1, meetOpened: before.meetOpened + 1 });
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

    await Promise.all([ana.context.close(), eva.context.close(), admin.close()]);
  });

  test('three people: shared room, a link added live, exact restore, border dithering and account deletion inside', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const eva = await person(browser, `eva-${run}@acme.com`, 'Eva');
    const space = await createSpace(ana.context.request, `Salas3 ${run}`);
    await joinByInvite(luis.context.request, space);
    await joinByInvite(eva.context.request, space);

    for (const someone of [ana, luis, eva]) {
      await openOffice(someone.page, space.slug, { media: true });
      const dismiss = someone.page.getByRole('button', { name: 'Entendido' });
      if (await dismiss.isVisible()) await dismiss.click();
    }
    // Spawns (11,25), (12,25), (13,25): up columns 11/12 to row 7 and along it.
    await walkTo(luis.page, { x: 12, y: 7 });
    await walkTo(luis.page, { x: 27, y: 7 });
    await walkTo(ana.page, { x: 11, y: 7 });
    await walkTo(ana.page, { x: 27, y: 7 });
    await walkTo(ana.page, { x: 27, y: 6 });
    await walkTo(eva.page, { x: 12, y: (await tile(eva.page)).y });
    await walkTo(eva.page, { x: 12, y: 7 });
    await walkTo(eva.page, { x: 25, y: 7 });

    // The room has no Meet link yet. Luis (member) is told to ask; Ana (owner) may add it.
    await luis.page.getByTestId('world-canvas').focus();
    await step(luis.page, 'ArrowRight');
    const luisCard = luis.page.getByRole('region', { name: 'Sala de reuniones' });
    await expect(luisCard).toContainText('Esta sala aún no tiene enlace de Meet.');
    await expect(luisCard).toContainText('Pide a quien administra el espacio que lo añada.');
    await expect(luisCard.getByRole('link')).toHaveCount(0);
    await ana.page.getByTestId('world-canvas').focus();
    await step(ana.page, 'ArrowRight');
    const anaCard = ana.page.getByRole('region', { name: 'Sala de reuniones' });
    await expect(anaCard.getByRole('link', { name: 'Añadir el enlace de Meet' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await expect(anaCard).toContainText('2 personas dentro');
    await expect(luisCard).toContainText('2 personas dentro');

    // The owner adds it from settings: both cards offer the Meet at once, without walking.
    const linked = await ana.context.request.put(`/api/spaces/${space.id}/rooms/${ROOM_ID}`, {
      headers: CLIENT,
      data: { meetUri: MEET_URI },
    });
    expect(linked.status()).toBe(200);
    await expect(luisCard.getByRole('button', { name: /Unirse a la reunión/ })).toBeVisible();
    // With the keyboard: X opens it (new tab, no opener).
    await luis.page.evaluate(() => {
      const opened: unknown[][] = [];
      (window as unknown as { __opened: unknown[][] }).__opened = opened;
      window.open = (...args: unknown[]) => {
        opened.push(args);
        return null;
      };
    });
    await luis.page.getByTestId('world-canvas').focus();
    await luis.page.keyboard.press('x');
    await expect
      .poll(() => luis.page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened))
      .toEqual([[MEET_URI, '_blank', 'noopener,noreferrer']]);

    // Eva turns her microphone off in the hallway (camera on), walks in and out: it comes back
    // exactly like that, not "all on".
    await eva.page.getByRole('button', { name: 'Silenciar micrófono' }).click();
    await expect.poll(async () => (await media(eva.page))?.micOn).toBe(false);
    await walkTo(eva.page, { x: 27, y: 7 });
    // Luis steps back out next to her, so the hallway has someone to hear Eva.
    await luis.page.getByTestId('world-canvas').focus();
    await walkTo(luis.page, { x: 26, y: 7 });
    await expect(luisCard).toHaveCount(0);
    await expect.poll(() => playing(luis.page, eva.userId), { timeout: 15_000 }).toBe(true);

    // Border dithering: seven steps, one every 200 ms, ending inside the room.
    await eva.page.getByTestId('world-canvas').focus();
    const inAndOut: ArrowKey[] = ['ArrowRight', 'ArrowLeft'];
    await dither(eva.page, [...inAndOut, ...inAndOut, ...inAndOut, 'ArrowRight']);
    await expect.poll(() => tile(eva.page), { timeout: 10_000 }).toEqual({ x: 28, y: 7 });
    const evaCard = eva.page.getByRole('region', { name: 'Sala de reuniones' });
    await expect(evaCard).toBeVisible();
    await expect
      .poll(
        async () => {
          const state = await media(eva.page);
          return [state?.micOn, state?.cameraOn];
        },
        { timeout: 10_000 },
      )
      .toEqual([false, false]);
    await expect
      .poll(async () => (await media(luis.page))?.subscribed.includes(eva.userId), {
        timeout: 5000,
      })
      .toBe(false);
    await expect(
      luis.page.locator(`[data-testid="hallway-video"][data-user-id="${eva.userId}"]`),
    ).toHaveCount(0);
    expect(await hearing(luis.page, eva.userId)).toBe(false);

    // And seven more ending in the hallway: the card goes, her media are as before entering.
    const outAndIn: ArrowKey[] = ['ArrowLeft', 'ArrowRight'];
    await dither(eva.page, [...outAndIn, ...outAndIn, ...outAndIn, 'ArrowLeft']);
    await expect.poll(() => tile(eva.page), { timeout: 10_000 }).toEqual({ x: 27, y: 7 });
    await expect(evaCard).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const state = await media(eva.page);
          return [state?.micOn, state?.cameraOn];
        },
        { timeout: 10_000 },
      )
      .toEqual([false, true]);
    await expect.poll(() => playing(luis.page, eva.userId), { timeout: 15_000 }).toBe(true);
    await expect(eva.page.getByRole('button', { name: 'Activar micrófono' })).toBeEnabled();

    // Luis deletes his account while connected (in a conversation with Eva): out of the office
    // and of the media room at once.
    await expect
      .poll(async () => (await media(eva.page))?.participants.includes(luis.userId))
      .toBe(true);
    const deleted = await luis.context.request.delete('/api/me', { headers: CLIENT });
    expect(deleted.status()).toBe(204);
    await expect
      .poll(() => remoteAvatar(ana.page, luis.userId), { timeout: 10_000 })
      .toBe(undefined);
    await expect
      .poll(
        async () => {
          const state = await media(eva.page);
          return [state?.participants.includes(luis.userId), state?.peers.includes(luis.userId)];
        },
        { timeout: 10_000 },
      )
      .toEqual([false, false]);
    expect(await hearing(eva.page, luis.userId)).toBe(false);
    const again = await luis.context.request.post(`/api/spaces/${space.id}/media-token`, {
      headers: CLIENT,
    });
    expect(again.status()).toBe(401);
    // Ana, still in the room, now counts one person.
    await expect(anaCard).toContainText('1 persona dentro');

    await Promise.all([ana.context.close(), luis.context.close(), eva.context.close()]);
  });
});
