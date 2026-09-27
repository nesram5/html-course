// Local TURN/TLS check (E5-S8). Run through ./run-turn-test.sh, which starts the LiveKit of
// livekit-turn-test.yaml. Two Chromium pages with UDP disabled and ICE restricted to relays join
// the same room: one publishes the fake camera, the other must receive its frames, and the
// selected ICE candidate must be a TURN relay over TLS.
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const LIVEKIT_URL = 'ws://localhost:7980';
const KEY = 'turntest';
const SECRET = 'turn-test-secret-with-at-least-32-characters';
const PAGE_URL = 'http://localhost:5499/turn-test';
const UMD = join(here, '../../../apps/web/node_modules/livekit-client/dist/livekit-client.umd.js');

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString(
    'base64url',
  );
}

/** A LiveKit access token (HS256 JWT) for the test room. */
function token(identity) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64url({
    iss: KEY,
    sub: identity,
    nbf: now - 10,
    exp: now + 600,
    video: { room: 'turn-test', roomJoin: true, canPublish: true, canSubscribe: true },
  });
  const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    // "UDP blocked": WebRTC may only use TCP (hence TURN over TCP/TLS).
    ...(process.env.TURN_TEST_ALLOW_UDP === '1'
      ? []
      : ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']),
    // The throwaway TURN certificate is self-signed.
    '--ignore-certificate-errors',
  ],
});

async function openPage() {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  // A localhost origin (secure context for getUserMedia) with livekit-client loaded.
  await page.route(PAGE_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>TURN</title>' }),
  );
  await page.goto(PAGE_URL);
  await page.addScriptTag({ path: UMD });
  await page.addScriptTag({ path: join(here, 'page.js') });
  return page;
}

let exitCode = 1;
const pages = [];
try {
  const publisher = await openPage();
  const subscriber = await openPage();
  pages.push(publisher, subscriber);
  await publisher.evaluate((args) => globalThis.turnTest.connect(args), {
    url: LIVEKIT_URL,
    token: token('publisher'),
  });
  await publisher.evaluate(() => globalThis.turnTest.publishCamera());
  await subscriber.evaluate((args) => globalThis.turnTest.connect(args), {
    url: LIVEKIT_URL,
    token: token('subscriber'),
  });
  const result = await subscriber.evaluate((ms) => globalThis.turnTest.receiveVideo(ms), 20_000);

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.ok && result.candidateType === 'relay' && result.relayProtocol === 'tls') {
    process.stdout.write('TURN/TLS OK: media flowed through the relay over TLS.\n');
    exitCode = 0;
  } else {
    process.stdout.write('TURN/TLS check FAILED.\n');
  }
} catch (error) {
  process.stdout.write(`TURN/TLS check FAILED: ${String(error).split('\n')[0]}\n`);
  for (const page of pages) {
    const log = await page.evaluate(() => globalThis.turnTest.iceLog()).catch(() => []);
    process.stdout.write(`ICE log: ${JSON.stringify(log)}\n`);
  }
} finally {
  await browser.close();
}
process.exit(exitCode);
