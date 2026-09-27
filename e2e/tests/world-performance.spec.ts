import { randomUUID } from 'node:crypto';

import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { avatars, createSpace, openOffice, signIn } from './support/world';

/**
 * E4-S5 "60 fps with 50 avatars": the development stress mode puts 49 fake people walking
 * (one world:delta per tick, like the server) next to the local avatar, through the real
 * RemotePlayersSystem and Phaser renderer.
 *
 * Headless Chromium draws WebGL with SwiftShader (a software GPU on a shared CPU), so its frame
 * rate says little about a laptop. What this test bounds is our part of each frame: main-thread
 * JavaScript time per frame (CDP `ScriptDuration`), which must stay far below the 16.7 ms budget.
 * The frame rates with 0 and 50 avatars are reported as annotations.
 */

const WINDOW_MS = 3000;

async function sample(page: Page, cdp: CDPSession) {
  const script = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'ScriptDuration')?.value ?? 0;
  };
  const scriptBefore = await script();
  const frames = await page.evaluate(
    (windowMs) =>
      new Promise<number>((resolve) => {
        let count = 0;
        const started = performance.now();
        const step = (now: number) => {
          count++;
          if (now - started < windowMs) requestAnimationFrame(step);
          else resolve(count);
        };
        requestAnimationFrame(step);
      }),
    WINDOW_MS,
  );
  const scriptSeconds = (await script()) - scriptBefore;
  return {
    fps: (frames * 1000) / WINDOW_MS,
    scriptMsPerFrame: (scriptSeconds * 1000) / frames,
  };
}

test('50 avatars walking cost little main-thread time per frame (stress mode)', async ({
  page,
}) => {
  const run = randomUUID().slice(0, 8);
  await signIn(page.request, `carga-${run}@bululu.local`, 'Carga');
  const space = await createSpace(page.request, `Carga ${run}`);
  await openOffice(page, space.slug);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  const alone = await sample(page, cdp);
  await page.evaluate(() => {
    window.__bululuWorld?.stress(49);
  });
  await expect.poll(async () => (await avatars(page)).length).toBe(50);
  await page.waitForTimeout(500);
  const crowded = await sample(page, cdp);

  test.info().annotations.push({
    type: 'performance',
    description:
      `1 avatar: ${alone.fps.toFixed(1)} fps, ${alone.scriptMsPerFrame.toFixed(2)} ms JS/frame; ` +
      `50 avatars: ${crowded.fps.toFixed(1)} fps, ${crowded.scriptMsPerFrame.toFixed(2)} ms JS/frame`,
  });
  // Walking avatars are drawn every frame (not only on ticks).
  expect((await avatars(page)).filter((avatar) => avatar.moving).length).toBeGreaterThan(0);
  expect(crowded.scriptMsPerFrame).toBeLessThan(4);
  await page.screenshot({ path: 'test-results/world-stress-50.png' });

  await page.evaluate(() => {
    window.__bululuWorld?.stress(0);
  });
  await expect.poll(async () => (await avatars(page)).length).toBe(1);
});
