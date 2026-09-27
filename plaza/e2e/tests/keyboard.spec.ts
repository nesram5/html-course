import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './support/world';

/**
 * E8-S6 / RNF-07: the whole UI outside the map canvas works with the keyboard alone. One person
 * creates a space, enters the office, uses the bottom bar and its panels, leaves, opens the
 * delete-account dialog and sends feedback without a single click.
 */

/** Presses Tab until `target` has the focus (fails if it is not reachable in `max` presses). */
async function tabTo(page: Page, target: Locator, max = 40): Promise<void> {
  await expect(target).toBeVisible();
  for (let i = 0; i <= max; i++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target, 'reachable with Tab').toBeFocused({ timeout: 1 });
}

test.describe('keyboard only (E8-S6)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('create a space, use the office and its panels, delete dialog and feedback', async ({
    page,
  }) => {
    const run = randomUUID().slice(0, 8);
    await signIn(page.request, `teclado-${run}@acme.com`, 'Teclado');

    // "Mis espacios" → "Crear espacio".
    await page.goto('/spaces');
    await tabTo(page, page.getByRole('link', { name: 'Crear espacio' }).first());
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/spaces\/new$/);

    // Name, template (radio: Space) and submit.
    await tabTo(page, page.getByRole('textbox', { name: 'Nombre del espacio' }));
    await page.keyboard.type(`Teclado ${run}`);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio').first()).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio').first()).toBeChecked();
    await tabTo(page, page.getByRole('button', { name: 'Crear espacio' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Crear salas de reunión' })).toBeVisible();
    await tabTo(page, page.getByRole('link', { name: /Lo haré más tarde|Entrar al espacio/ }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/s\/teclado-/);

    // The pre-join: switch camera and microphone off, then "Entrar".
    const prejoin = page.getByTestId('prejoin');
    await expect(prejoin).toBeVisible({ timeout: 30_000 });
    for (const name of ['Cámara activada', 'Micrófono activado']) {
      const box = prejoin.getByRole('checkbox', { name });
      await tabTo(page, box);
      await page.keyboard.press('Space');
      await expect(box).not.toBeChecked();
    }
    await tabTo(page, prejoin.getByRole('button', { name: /^Entrar/ }));
    await page.keyboard.press('Enter');
    const canvas = page.getByTestId('world-canvas');
    await expect(canvas).toHaveAttribute('data-tile-x', /^\d+$/, { timeout: 30_000 });
    // Leaving the gate puts the focus on the map.
    await expect(page.getByRole('application')).toBeFocused();

    // "Personas": opens with Enter, Escape closes it and gives the focus back.
    const bar = page.getByRole('group', { name: 'Tus controles' });
    const people = bar.getByRole('button', { name: /^Personas/ });
    await tabTo(page, people);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Personas', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Personas', exact: true })).toHaveCount(0);
    await expect(people).toBeFocused();

    // Chat: the box takes the focus; Enter sends.
    await tabTo(page, bar.getByRole('button', { name: 'Chat del espacio' }));
    await page.keyboard.press('Enter');
    const box = page.getByRole('textbox', { name: 'Mensaje para todo el espacio' });
    await expect(box).toBeFocused();
    await page.keyboard.type('Hola desde el teclado');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('list', { name: 'Mensajes' }).getByText('Hola desde el teclado'),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Status: Enter opens the menu, arrows move, Enter chooses.
    await tabTo(page, bar.getByRole('button', { name: /^Estado:/ }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(bar.getByRole('button', { name: 'Estado: Ocupado' })).toBeFocused();

    // Speaker switch: a small dialog with the list; Escape closes it.
    const speaker = bar.getByRole('button', { name: /^Altavoz/ });
    await tabTo(page, speaker);
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog', { name: 'Elegir altavoz' }).getByLabel('Altavoz'),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(speaker).toBeFocused();

    // "Salir" back to "Mis espacios".
    await tabTo(page, page.getByRole('link', { name: 'Salir' }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/spaces$/);

    // Profile → "Borrar mi cuenta…": the dialog keeps the focus inside and Escape closes it.
    await tabTo(page, page.getByRole('link', { name: 'Teclado' }));
    await page.keyboard.press('Enter');
    const open = page.getByRole('button', { name: 'Borrar mi cuenta…' });
    await expect(open).toBeEnabled();
    await tabTo(page, open);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    const cancel = dialog.getByRole('button', { name: 'Cancelar' });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Sí, borrar mi cuenta' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();

    // Feedback from the user menu.
    await tabTo(page, page.getByRole('link', { name: 'Enviar comentarios' }).first());
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('textbox', { name: '¿Qué te gustaría contarnos?' }));
    await page.keyboard.type('Todo con el teclado');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: '2 · Mal' })).toBeChecked();
    await tabTo(page, page.getByRole('button', { name: 'Enviar' }));
    await page.keyboard.press('Enter');
    await expect(page.getByText('¡Gracias! Hemos recibido tus comentarios.')).toBeFocused();
  });
});
