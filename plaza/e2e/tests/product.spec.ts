import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { office } from './support/office';
import {
  CLIENT,
  createSpace,
  enterOffice,
  joinByInvite,
  openOffice,
  remoteAvatar,
  signIn,
} from './support/world';

/**
 * E8-S6 end to end: "Borrar mi cuenta" with someone else in the office. (The metrics fed by the
 * brief flow 2 are checked in `join-invite.spec.ts`.)
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

test.describe('account deletion (E8-S6)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('deleting my account takes me out of the office, frees my desk and anonymises my messages', async ({
    browser,
  }) => {
    const run = randomUUID().slice(0, 8);
    const ana = await person(browser, `ana-${run}@acme.com`, 'Ana');
    const luis = await person(browser, `luis-${run}@acme.com`, 'Luis');
    const space = await createSpace(ana.context.request, `Borrado ${run}`);
    await joinByInvite(luis.context.request, space);
    const claimed = await luis.context.request.put(`/api/spaces/${space.id}/desks/desk-01`, {
      headers: CLIENT,
      data: {},
    });
    expect(claimed.status()).toBe(200);

    await openOffice(ana.page, space.slug);
    await openOffice(luis.page, space.slug);
    await expect.poll(async () => (await remoteAvatar(ana.page, luis.userId))?.alpha).toBe(1);
    await expect
      .poll(async () => (await office(ana.page))?.desks.find((d) => d.deskId === 'desk-01')?.label)
      .toBe('Luis');

    // Luis says hello in the chat; Ana reads it with his name.
    await luis.page.getByRole('button', { name: 'Chat del espacio' }).click();
    await luis.page.getByRole('textbox', { name: 'Mensaje para todo el espacio' }).fill('Adiós');
    await luis.page.keyboard.press('Enter');
    await ana.page.getByRole('button', { name: /^Chat del espacio/ }).click();
    const anaChat = ana.page.getByTestId('chat-message').filter({ hasText: 'Adiós' });
    await expect(anaChat).toContainText('Luis');

    // Luis deletes his account from his profile, in another tab.
    const profile = await luis.context.newPage();
    await profile.goto('/profile');
    await profile.getByRole('button', { name: 'Borrar mi cuenta…' }).click();
    await profile.getByRole('button', { name: 'Sí, borrar mi cuenta' }).click();
    await expect(profile).toHaveURL(/\/login$/);
    await expect(
      profile.getByText('Tu cuenta se ha borrado. Gracias por probar Plaza.'),
    ).toBeVisible();

    // His office tab is told and leaves; Ana sees him go and his desk free at once.
    await expect(luis.page).not.toHaveURL(/\/s\//);
    await expect.poll(() => remoteAvatar(ana.page, luis.userId)).toBeUndefined();
    await expect
      .poll(async () => (await office(ana.page))?.desks.find((d) => d.deskId === 'desk-01')?.label)
      .toBeFalsy();
    expect((await luis.context.request.get('/api/me')).status()).toBe(401);

    // His message stays, without his name.
    await ana.page.reload();
    await enterOffice(ana.page);
    await ana.page.getByRole('button', { name: /^Chat del espacio/ }).click();
    await expect(ana.page.getByTestId('chat-message').filter({ hasText: 'Adiós' })).toContainText(
      'Usuario eliminado',
    );
    await Promise.all([ana.context.close(), luis.context.close()]);
  });
});
