import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { office } from './support/office';
import {
  CLIENT,
  createSpace,
  joinByInvite,
  openOffice,
  remoteAvatar,
  setTabHidden,
  signIn,
  walkToColumn,
  type CreatedSpace,
} from './support/world';

/**
 * Adversarial checks across E5, E7 and E9 with the real server and the local LiveKit: what the
 * happy-path specs do not try (a third person who must hear nothing, restoring exactly what was
 * on, ring cooldowns across a reload, media after a removal, hostile chat text, forged desk and
 * style requests).
 */

interface MediaProbe {
  connection: string;
  micOn: boolean;
  cameraOn: boolean;
  peers: string[];
  subscribed: string[];
  participants: string[];
}

interface Person {
  context: BrowserContext;
  page: Page;
  userId: string;
  name: string;
}

declare global {
  interface Window {
    __ringNotifications?: string[];
    __pwned?: boolean;
  }
}

async function person(browser: Browser, email: string, name: string): Promise<Person> {
  const context = await browser.newContext();
  // Headless Chromium shows no notifications: record their titles, with the permission granted.
  await context.addInitScript(() => {
    const shown: string[] = [];
    window.__ringNotifications = shown;
    class RecordingNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      onclick: (() => void) | null = null;
      constructor(title: string) {
        shown.push(title);
      }
      close() {
        return undefined;
      }
    }
    Object.defineProperty(window, 'Notification', { value: RecordingNotification });
  });
  const userId = await signIn(context.request, email, name);
  return { context, page: await context.newPage(), userId, name };
}

async function media(page: Page): Promise<MediaProbe | undefined> {
  return page.evaluate(() =>
    (window as { __plazaMedia?: { state(): MediaProbe } }).__plazaMedia?.state(),
  );
}

function micAndCamera(page: Page) {
  return async () => {
    const state = await media(page);
    return [state?.micOn, state?.cameraOn];
  };
}

/** The camera of `userId` shows frames in the hallway strip of `page`. */
function seeing(page: Page, userId: string): Promise<boolean> {
  return page
    .locator(`[data-testid="hallway-video"][data-user-id="${userId}"] video`)
    .evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0)
    .catch(() => false);
}

/** The microphone of `userId` plays in `page` (the media feature appends one <audio> per track). */
function hearing(page: Page, userId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const audio = document.querySelector<HTMLAudioElement>(`audio[data-plaza-audio="${id}"]`);
    const track = (audio?.srcObject as MediaStream | null | undefined)?.getAudioTracks()[0];
    return audio !== null && !audio.paused && track?.readyState === 'live';
  }, userId);
}

function bar(page: Page) {
  return page.getByRole('group', { name: 'Tus controles' });
}

/** Eva (owner) walks far away first; Ana and Luis then spawn next to each other. */
async function threePeople(browser: Browser, label: string) {
  const run = randomUUID().slice(0, 8);
  const eva = await person(browser, `eva-${run}@acme.com`, 'Eva');
  const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
  const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
  const space: CreatedSpace = await createSpace(eva.context.request, `${label} ${run}`);
  await joinByInvite(ana.context.request, space);
  await joinByInvite(luis.context.request, space);
  return { eva, ana, luis, space };
}

test.describe('hostile and edge cases across hallway, presence and personalization', () => {
  test('media: both ways between neighbours, nothing for the third; exact restore; ring and removal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { eva, ana, luis, space } = await threePeople(browser, 'Bordes');
    await openOffice(eva.page, space.slug, { media: true });
    await walkToColumn(eva.page, 26);
    await openOffice(ana.page, space.slug, { media: true });
    await openOffice(luis.page, space.slug, { media: true });

    // Ana and Luis see AND hear each other.
    for (const [who, other] of [
      [ana, luis],
      [luis, ana],
    ] as const) {
      await expect.poll(() => seeing(who.page, other.userId), { timeout: 10_000 }).toBe(true);
      await expect.poll(() => hearing(who.page, other.userId), { timeout: 10_000 }).toBe(true);
    }
    // Eva, far away, has no peers, no subscriptions and plays no audio; nobody subscribes to her.
    expect(await media(eva.page)).toMatchObject({ connection: 'connected', peers: [] });
    expect((await media(eva.page))?.subscribed).toEqual([]);
    await expect(eva.page.locator('audio[data-plaza-audio]')).toHaveCount(0);
    expect((await media(ana.page))?.subscribed).toEqual([luis.userId]);
    expect((await media(luis.page))?.subscribed).toEqual([ana.userId]);

    // Away restores exactly what was on: Ana muted her microphone by hand, her camera was on.
    await bar(ana.page).getByRole('button', { name: 'Silenciar micrófono' }).click();
    await expect.poll(micAndCamera(ana.page)).toEqual([false, true]);
    await setTabHidden(ana.page, true);
    await expect.poll(micAndCamera(ana.page)).toEqual([false, false]);
    await expect
      .poll(async () => (await remoteAvatar(luis.page, ana.userId))?.presence)
      .toBe('away');

    // Luis rings her from the "Ausente · Llamar" card; a second ring waits 30 s.
    const card = luis.page.getByRole('group', { name: 'Ana está ausente' });
    await card.getByRole('button', { name: /Llamar/ }).click();
    await expect
      .poll(() => ana.page.evaluate(() => window.__ringNotifications))
      .toEqual(['Luis te está llamando']);
    await expect(card.getByRole('button', { name: /Podrás volver a llamar/ })).toBeDisabled();

    await setTabHidden(ana.page, false);
    await expect.poll(micAndCamera(ana.page)).toEqual([false, true]);

    // A reload does not buy another ring: the server keeps the cooldown per person.
    await openOffice(luis.page, space.slug, { media: true });
    await bar(luis.page)
      .getByRole('button', { name: /Personas/ })
      .click();
    await luis.page.getByRole('button', { name: 'Llamar a Ana' }).click();
    await expect(luis.page.getByText('Espera un poco antes de volver a llamar.')).toBeVisible();
    expect(await ana.page.evaluate(() => window.__ringNotifications?.length)).toBe(1);

    // Removed from the space: out of the media room at once, and no new media token.
    await expect.poll(() => seeing(ana.page, luis.userId), { timeout: 10_000 }).toBe(true);
    const removed = await eva.context.request.delete(
      `/api/spaces/${space.id}/members/${luis.userId}`,
      { headers: CLIENT },
    );
    expect(removed.status()).toBe(204);
    await expect
      .poll(async () => (await media(ana.page))?.participants.includes(luis.userId), {
        timeout: 5000,
      })
      .toBe(false);
    await expect(ana.page.locator(`audio[data-plaza-audio="${luis.userId}"]`)).toHaveCount(0);
    const token = await luis.context.request.post(`/api/spaces/${space.id}/media-token`, {
      headers: CLIENT,
    });
    expect(token.status()).toBe(404);
    await expect
      .poll(async () => (await media(luis.page))?.connection ?? 'gone')
      .not.toBe('connected');

    for (const someone of [eva, ana, luis]) await someone.context.close();
  });

  test('hostile input: chat markup stays text; forged desk and style requests are refused', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { eva, ana, luis, space } = await threePeople(browser, 'Hostil');
    await openOffice(eva.page, space.slug);
    await openOffice(ana.page, space.slug);

    // Chat: markup and non-http links are shown as text; only the https link is clickable.
    await bar(ana.page).getByRole('button', { name: 'Chat del espacio' }).click();
    const input = ana.page.getByRole('textbox', { name: 'Mensaje para todo el espacio' });
    await input.fill(
      '<img src=x onerror="window.__pwned=true"> javascript:alert(1) [x](javascript:alert(2)) https://ok.example/a',
    );
    await input.press('Enter');
    await bar(eva.page)
      .getByRole('button', { name: /mensaje sin leer/ })
      .click();
    const message = eva.page.getByTestId('chat-message').last();
    await expect(message).toContainText('<img src=x onerror=');
    await expect(message.locator('img')).toHaveCount(0);
    expect(await eva.page.evaluate(() => window.__pwned)).toBeUndefined();
    const links = await message
      .locator('a')
      .evaluateAll((anchors) =>
        anchors.map((a) => [
          a.getAttribute('href'),
          a.getAttribute('rel'),
          a.getAttribute('target'),
        ]),
      );
    expect(links).toEqual([['https://ok.example/a', 'noopener noreferrer', '_blank']]);

    // Style: members get 403, unknown or crafted ids 400; nothing reaches the office.
    const spaceUrl = `/api/spaces/${space.id}`;
    const patch = (who: Person, themeId: string) =>
      who.context.request.patch(spaceUrl, { headers: CLIENT, data: { themeId } });
    expect((await patch(ana, 'night')).status()).toBe(403);
    expect((await patch(eva, 'sepia')).status()).toBe(400);
    expect((await patch(eva, '../../pixel')).status()).toBe(400);
    expect((await office(ana.page))?.themeId).toBe('pixel');

    // Two people claim the same desk at once: exactly one wins, and the office shows one name.
    const deskUrl = `/api/spaces/${space.id}/desks/desk-05`;
    const claims = await Promise.all(
      [ana, luis].map((who) => who.context.request.put(deskUrl, { headers: CLIENT, data: {} })),
    );
    expect(claims.map((claim) => claim.status()).sort()).toEqual([200, 409]);
    const winner = claims[0]?.status() === 200 ? ana : luis;
    const loser = winner === ana ? luis : ana;

    // Decoration: forged items, too many items, someone else's desk (owner included) → refused.
    const decorate = (who: Person, slots: (string | null)[]) =>
      who.context.request.patch(`${deskUrl}/decor`, { headers: CLIENT, data: { slots } });
    expect((await decorate(winner, ['plant', '<script>', null])).status()).toBe(400);
    expect((await decorate(winner, ['__proto__', null, null])).status()).toBe(400);
    expect((await decorate(winner, ['plant', 'plant', 'plant', 'plant'])).status()).toBe(400);
    expect((await decorate(loser, ['plant', null, null])).status()).toBe(403);
    expect((await decorate(eva, ['plant', null, null])).status()).toBe(403);
    expect((await decorate(winner, ['plant', 'lamp', null])).status()).toBe(200);
    await expect
      .poll(async () => (await office(eva.page))?.desks)
      .toEqual([{ deskId: 'desk-05', label: winner.name, items: ['plant', 'lamp'] }]);

    for (const someone of [eva, ana, luis]) await someone.context.close();
  });
});
