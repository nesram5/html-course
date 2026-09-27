import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { avatars, createSpace, openOffice, signIn } from './support/world';

/**
 * E4-S5 "60 fps with 50 avatars": the development stress mode puts 49 fake people walking
 * (one world:delta per tick, like the server) next to the local avatar, through the real
 * RemotePlayersSystem and Phaser renderer, and the page measures its own frame rate.
 */
test('keeps the frame rate with 50 avatars walking (stress mode)', async ({ page }) => {
  const run = randomUUID().slice(0, 8);
  await signIn(page.request, `carga-${run}@plaza.local`, 'Carga');
  const space = await createSpace(page.request, `Carga ${run}`);
  await openOffice(page, space.slug);

  await page.evaluate(() => {
    window.__plazaWorld?.stress(49);
  });
  await expect.poll(async () => (await avatars(page)).length).toBe(50);
  await page.waitForTimeout(1000);

  // Frame times measured by the page itself over 5 s (requestAnimationFrame).
  const stats = await page.evaluate(
    () =>
      new Promise<{ fps: number; p95: number; phaserFps: number }>((resolve) => {
        const frames: number[] = [];
        let last = performance.now();
        const started = last;
        const step = (now: number) => {
          frames.push(now - last);
          last = now;
          if (now - started < 5000) {
            requestAnimationFrame(step);
            return;
          }
          const sorted = [...frames].sort((a, b) => a - b);
          resolve({
            fps: (frames.length * 1000) / (now - started),
            p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
            phaserFps: window.__plazaWorld?.fps() ?? 0,
          });
        };
        requestAnimationFrame(step);
      }),
  );
  test.info().annotations.push({
    type: 'performance',
    description: `50 avatars: ${stats.fps.toFixed(1)} fps (rAF), p95 frame ${stats.p95.toFixed(1)} ms, Phaser ${stats.phaserFps.toFixed(1)} fps`,
  });
  // Headless Chromium renders with a software GPU: the bound leaves room for slow CI machines
  // while still catching a per-frame regression (a real GPU runs at the display rate).
  expect(stats.fps).toBeGreaterThan(45);
  await page.screenshot({ path: 'test-results/world-stress-50.png' });

  await page.evaluate(() => {
    window.__plazaWorld?.stress(0);
  });
  await expect.poll(async () => (await avatars(page)).length).toBe(1);
});
