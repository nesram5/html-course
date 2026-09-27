import { execFile, fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';

import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
  VideoStream,
  dispose,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

import {
  mbps,
  monthlyTerabytes,
  parseDockerCpu,
  planConversations,
  stat,
  sumPrometheus,
  type MediaParticipant,
} from './media-plan.js';

const USAGE = `Usage: pnpm --filter @bululu/load media [options]

Hallway media load (E8-S3): G conversations of N people in ONE LiveKit room (like a Plaza space),
each person publishing a synthetic camera (simulcast) and microphone and subscribing only to the
others of their conversation (the media:peers of Plaza). Samples the LiveKit container CPU
(docker stats) and its traffic (Prometheus byte counters) while they talk.

  --livekit-url <ws url>     default ws://127.0.0.1:7880
  --api-key / --api-secret   default devkey / secret
  --groups <n>               conversations (default 12)
  --size <n>                 people per conversation (default 4)
  --duration <s>             talking time after everyone is in (default 600)
  --width/--height/--fps     published camera (default 320x180 @ 15, noise: reaches the cap)
  --max-bitrate <bps>        camera bitrate cap (default 450000, LiveKit's h360 preset)
  --simulcast                publish simulcast layers (off by default: see docs/load-test.md)
  --processes <n>            client processes sharing the people (default 4)
  --container <name>         LiveKit container for docker stats (default livekit)
  --metrics-url <url>        LiveKit Prometheus endpoint (optional)
  --media-vcpus <n>          vCPUs of the media VM, to express the CPU as a share (default 4)
  --sample-every <s>         default 10
`;

const { values } = parseArgs({
  options: {
    'livekit-url': { type: 'string', default: 'ws://127.0.0.1:7880' },
    'api-key': { type: 'string', default: 'devkey' },
    'api-secret': { type: 'string', default: 'secret' },
    groups: { type: 'string', default: '12' },
    size: { type: 'string', default: '4' },
    duration: { type: 'string', default: '600' },
    width: { type: 'string', default: '320' },
    height: { type: 'string', default: '180' },
    simulcast: { type: 'boolean', default: false },
    processes: { type: 'string', default: '4' },
    fps: { type: 'string', default: '15' },
    'max-bitrate': { type: 'string', default: '450000' },
    container: { type: 'string', default: 'livekit' },
    'metrics-url': { type: 'string', default: '' },
    'media-vcpus': { type: 'string', default: '4' },
    'sample-every': { type: 'string', default: '10' },
    help: { type: 'boolean', default: false },
  },
});

const run = promisify(execFile);

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function positive(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
}

/**
 * Noise frames (I420): incompressible, so the encoder sends at its bitrate cap and the SFU
 * forwards as many packets as a real camera at that bitrate, at a fraction of the encoding cost.
 */
function syntheticFrames(width: number, height: number, count: number): VideoFrame[] {
  const frames: VideoFrame[] = [];
  const lumaSize = width * height;
  const chromaSize = (width / 2) * (height / 2);
  let seed = 12345;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed >> 16;
  };
  for (let f = 0; f < count; f++) {
    const data = new Uint8Array(lumaSize + chromaSize * 2);
    for (let i = 0; i < lumaSize; i++) data[i] = next() & 0xff;
    data.fill(128, lumaSize);
    frames.push(new VideoFrame(data, width, height, VideoBufferType.I420));
  }
  return frames;
}

/** 20 ms of a quiet 220 Hz tone (48 kHz mono): Opus keeps sending, as with a live microphone. */
function toneFrame(): AudioFrame {
  const samples = 960;
  const data = new Int16Array(samples);
  for (let i = 0; i < samples; i++)
    data[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / 48_000) * 800);
  return new AudioFrame(data, 48_000, 1, samples);
}

interface Person {
  plan: MediaParticipant;
  room: Room;
  video: VideoSource;
  audio: AudioSource;
  subscribed: Set<string>;
}

async function tokenFor(identity: string, room: string): Promise<string> {
  const token = new AccessToken(values['api-key'], values['api-secret'], { identity, ttl: '2h' });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return token.toJwt();
}

async function join(
  plan: MediaParticipant,
  roomName: string,
  width: number,
  height: number,
): Promise<Person> {
  const room = new Room();
  const subscribed = new Set<string>();
  const peers = new Set(plan.peers);
  const subscribeIfPeer = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (peers.has(participant.identity)) publication.setSubscribed(true);
  };
  room.on(RoomEvent.TrackPublished, subscribeIfPeer);
  room.on(
    RoomEvent.TrackSubscribed,
    (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      subscribed.add(
        `${participant.identity}:${track.kind === TrackKind.KIND_VIDEO ? 'video' : 'audio'}`,
      );
    },
  );
  try {
    await room.connect(values['livekit-url'], await tokenFor(plan.identity, roomName), {
      autoSubscribe: false,
      dynacast: true,
    });
  } catch (error) {
    await room.disconnect().catch(() => undefined);
    throw error;
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      subscribeIfPeer(publication, participant);
    }
  }
  const video = new VideoSource(width, height);
  const audio = new AudioSource(48_000, 1);
  const local = room.localParticipant;
  if (local === undefined) throw new Error('not connected');
  await local.publishTrack(
    LocalAudioTrack.createAudioTrack('microphone', audio),
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE, dtx: false }),
  );
  await local.publishTrack(
    LocalVideoTrack.createVideoTrack('camera', video),
    new TrackPublishOptions({
      source: TrackSource.SOURCE_CAMERA,
      simulcast: values.simulcast,
      videoEncoding: {
        maxBitrate: BigInt(values['max-bitrate']),
        maxFramerate: Number(values.fps),
      },
    }),
  );
  return { plan, room, video, audio, subscribed };
}

interface Sample {
  atS: number;
  cpuPercentOfOneCore: number | null;
  inMbps: number | null;
  outMbps: number | null;
}

async function dockerCpu(container: string): Promise<number | null> {
  try {
    const { stdout } = await run('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{.CPUPerc}}',
      container,
    ]);
    return parseDockerCpu(stdout);
  } catch {
    return null;
  }
}

async function trafficBytes(url: string): Promise<{ incoming: number; outgoing: number } | null> {
  if (url === '') return null;
  try {
    const text = await (await fetch(url)).text();
    const incoming = sumPrometheus(text, 'livekit_packet_bytes', {
      name: 'direction',
      value: 'incoming',
    });
    const outgoing = sumPrometheus(text, 'livekit_packet_bytes', {
      name: 'direction',
      value: 'outgoing',
    });
    return incoming === null || outgoing === null ? null : { incoming, outgoing };
  } catch {
    return null;
  }
}

/** Messages between the coordinator and its client processes. */
type ShardMessage =
  | { type: 'joined'; people: number; failed: number }
  | { type: 'ready'; people: number; complete: number }
  | { type: 'report'; complete: number; receivedFps: number | null }
  | { type: 'failed'; error: string };

interface Settings {
  groups: number;
  size: number;
  durationS: number;
  width: number;
  height: number;
  fps: number;
  vcpus: number;
  sampleEveryS: number;
  processes: number;
}

function settings(): Settings {
  return {
    groups: positive('groups', values.groups),
    size: positive('size', values.size),
    durationS: positive('duration', values.duration),
    width: positive('width', values.width),
    height: positive('height', values.height),
    fps: positive('fps', values.fps),
    vcpus: positive('media-vcpus', values['media-vcpus']),
    sampleEveryS: positive('sample-every', values['sample-every']),
    processes: positive('processes', values.processes),
  };
}

/**
 * A client process: joins its share of the people (whole conversations), feeds their camera and
 * microphone, and reports when everyone subscribed to their peers. Shard 0 also decodes the
 * video one person receives, to prove the media flows.
 */
async function shard(
  index: number,
  runId: string,
  roomName: string,
  config: Settings,
): Promise<void> {
  const send = (message: ShardMessage) => process.send?.(message);
  const plans = planConversations(config.groups, config.size, runId).filter(
    (plan) => plan.group % config.processes === index,
  );
  const people: Person[] = [];
  let failed = 0;
  // Everyone joins before any camera sends frames: joining (ICE, DTLS) is the fragile part on a
  // loaded machine, and idle encoders leave it the CPU.
  for (const plan of plans) {
    for (let attempt = 1; ; attempt++) {
      try {
        people.push(await join(plan, roomName, config.width, config.height));
        break;
      } catch (error) {
        process.stderr.write(
          `${plan.identity}: join attempt ${String(attempt)} failed (${error instanceof Error ? error.message : String(error)})\n`,
        );
        if (attempt >= 4) {
          failed++;
          break;
        }
        await sleep(3000 * attempt);
      }
    }
  }
  send({ type: 'joined', people: people.length, failed });
  await nextCommand('start');

  const frames = syntheticFrames(config.width, config.height, 16);
  const tone = toneFrame();
  let frameIndex = 0;
  const videoTimer = setInterval(() => {
    const frame = frames[frameIndex++ % frames.length];
    if (frame === undefined) return;
    for (const person of people) person.video.captureFrame(frame);
  }, 1000 / config.fps);
  const audioTimer = setInterval(() => {
    for (const person of people) void person.audio.captureFrame(tone).catch(() => undefined);
  }, 20);

  let receivedFrames = 0;
  const streams: VideoStream[] = [];
  const watch = async (track: RemoteTrack) => {
    if (track.kind !== TrackKind.KIND_VIDEO) return;
    const stream = new VideoStream(track);
    streams.push(stream);
    for await (const _event of stream) receivedFrames++;
  };
  const watcher = index === 0 ? people[0] : undefined;
  if (watcher !== undefined) {
    watcher.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => void watch(track));
    for (const participant of watcher.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track !== undefined) void watch(publication.track);
      }
    }
  }
  // Subscriptions requested while a peer was still publishing can be lost on a loaded machine:
  // ask again for any peer track not subscribed yet (the browser re-applies media:peers too).
  const sweep = setInterval(() => {
    for (const person of people) {
      const peers = new Set(person.plan.peers);
      for (const participant of person.room.remoteParticipants.values()) {
        if (!peers.has(participant.identity)) continue;
        for (const publication of participant.trackPublications.values()) {
          if (!publication.subscribed) publication.setSubscribed(true);
        }
      }
    }
  }, 5000);
  const expected = (config.size - 1) * 2;
  const complete = () => people.filter((person) => person.subscribed.size === expected).length;
  await sleep(10_000);
  send({ type: 'ready', people: people.length, complete: complete() });
  const framesAtReady = receivedFrames;
  const readyAt = Date.now();

  await nextCommand('stop');
  const seconds = (Date.now() - readyAt) / 1000;
  send({
    type: 'report',
    complete: complete(),
    receivedFps:
      watcher === undefined ? null : (receivedFrames - framesAtReady) / seconds / (config.size - 1),
  });
  clearInterval(videoTimer);
  clearInterval(audioTimer);
  clearInterval(sweep);
  for (const stream of streams) void stream.cancel().catch(() => undefined);
  await Promise.all(people.map((person) => person.room.disconnect()));
  await dispose();
  process.exit(0);
}

/** Resolves on the coordinator's next `{ type }` command. */
function nextCommand(type: 'start' | 'stop'): Promise<void> {
  return new Promise((resolve) => {
    const onMessage = (message: { type?: string }) => {
      if (message.type !== type) return;
      process.off('message', onMessage);
      resolve();
    };
    process.on('message', onMessage);
  });
}

function waitFor(child: ChildProcess, type: ShardMessage['type']): Promise<ShardMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: ShardMessage) => {
      if (message.type === 'failed') reject(new Error(message.error));
      else if (message.type === type) {
        child.off('message', onMessage);
        resolve(message);
      }
    };
    child.on('message', onMessage);
    child.once('exit', (code) => {
      reject(new Error(`client process exited with ${String(code)}`));
    });
  });
}

async function coordinate(config: Settings): Promise<void> {
  const runId = randomUUID().slice(0, 8);
  const roomName = `media-load-${runId}`;
  const total = config.groups * config.size;
  print(
    `Media load ${runId}: ${String(config.groups)} conversations × ${String(config.size)} people = ${String(total)} in room ${roomName}, camera ${String(config.width)}x${String(config.height)}@${String(config.fps)} (${values.simulcast ? 'simulcast' : 'one layer'}, cap ${values['max-bitrate']} bps) + microphone, ${String(config.durationS)} s, ${String(config.processes)} client processes → ${values['livekit-url']}`,
  );
  const idleCpu = await dockerCpu(values.container);
  print(`LiveKit CPU before: ${idleCpu === null ? 'n/a' : `${idleCpu.toFixed(1)} %`}`);

  const joinStarted = Date.now();
  const children = Array.from({ length: config.processes }, (_, index) =>
    fork(process.argv[1] ?? '', process.argv.slice(2), {
      env: { ...process.env, MEDIA_SHARD: String(index), MEDIA_RUN: runId },
      execArgv: process.execArgv,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    }),
  );
  try {
    const joined = await Promise.all(children.map((child) => waitFor(child, 'joined')));
    const failedJoins = joined.reduce((sum, m) => sum + (m.type === 'joined' ? m.failed : 0), 0);
    print(
      `joined in ${String(Math.round((Date.now() - joinStarted) / 1000))} s (${String(failedJoins)} could not join); cameras and microphones start`,
    );
    const readyPromises = children.map((child) => waitFor(child, 'ready'));
    for (const child of children) child.send({ type: 'start' });
    const ready = await Promise.all(readyPromises);
    const people = ready.reduce((sum, m) => sum + (m.type === 'ready' ? m.people : 0), 0);
    const complete = ready.reduce((sum, m) => sum + (m.type === 'ready' ? m.complete : 0), 0);
    print(
      `${String(people)} people publishing; subscriptions complete (${String((config.size - 1) * 2)} tracks each): ${String(complete)}/${String(people)}`,
    );

    const samples: Sample[] = [];
    const started = Date.now();
    let previous = await trafficBytes(values['metrics-url']);
    let previousAt = Date.now();
    while (Date.now() - started < config.durationS * 1000) {
      await sleep(config.sampleEveryS * 1000);
      const cpu = await dockerCpu(values.container);
      const traffic = await trafficBytes(values['metrics-url']);
      const now = Date.now();
      const seconds = (now - previousAt) / 1000;
      const sample: Sample = {
        atS: Math.round((now - started) / 1000),
        cpuPercentOfOneCore: cpu,
        inMbps:
          traffic !== null && previous !== null
            ? mbps(traffic.incoming - previous.incoming, seconds)
            : null,
        outMbps:
          traffic !== null && previous !== null
            ? mbps(traffic.outgoing - previous.outgoing, seconds)
            : null,
      };
      previous = traffic;
      previousAt = now;
      samples.push(sample);
      print(`  ${JSON.stringify(sample)}`);
    }
    const talkedS = (Date.now() - started) / 1000;
    const reports = await Promise.all(
      children.map((child) => {
        const report = waitFor(child, 'report');
        child.send({ type: 'stop' });
        return report;
      }),
    );
    const stillComplete = reports.reduce(
      (sum, m) => sum + (m.type === 'report' ? m.complete : 0),
      0,
    );
    const receivedFps = reports.find((m) => m.type === 'report' && m.receivedFps !== null);

    const cpu = stat(
      samples.flatMap((s) => (s.cpuPercentOfOneCore === null ? [] : [s.cpuPercentOfOneCore])),
    );
    const incoming = stat(samples.flatMap((s) => (s.inMbps === null ? [] : [s.inMbps])));
    const outgoing = stat(samples.flatMap((s) => (s.outMbps === null ? [] : [s.outMbps])));
    const share = (value: number) =>
      `${(value / config.vcpus).toFixed(1)} % of ${String(config.vcpus)} vCPU`;
    const fps = receivedFps?.type === 'report' ? receivedFps.receivedFps : null;
    print();
    print(
      `people / conversations:  ${String(people)} / ${String(config.groups)} (could not join: ${String(failedJoins)}; subscriptions complete at the end: ${String(stillComplete)})`,
    );
    print(`video received by one:   ${fps === null ? 'n/a' : fps.toFixed(1)} fps per peer`);
    print(
      cpu === null
        ? 'LiveKit CPU:             n/a'
        : `LiveKit CPU:             avg ${cpu.avg.toFixed(1)} % (${share(cpu.avg)}) · max ${cpu.max.toFixed(1)} % (${share(cpu.max)}) of one core`,
    );
    if (incoming !== null && outgoing !== null) {
      print(
        `LiveKit traffic:         in avg ${incoming.avg.toFixed(1)} Mbps · out avg ${outgoing.avg.toFixed(1)} Mbps (max ${outgoing.max.toFixed(1)})`,
      );
      print(
        `monthly out (8 h × 22 d): ${monthlyTerabytes(outgoing.avg, 8, 22).toFixed(2)} TB at this load all day`,
      );
    }
    print(
      JSON.stringify({
        run: runId,
        ...config,
        durationS: talkedS,
        people,
        failedJoins,
        stillComplete,
        cpu,
        incoming,
        outgoing,
        receivedFps: fps,
        samples,
      }),
    );
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
  }
}

async function main(): Promise<void> {
  if (values.help) {
    print(USAGE);
    return;
  }
  const config = settings();
  const shardIndex = process.env.MEDIA_SHARD;
  if (shardIndex === undefined) {
    await coordinate(config);
    return;
  }
  const runId = process.env.MEDIA_RUN ?? 'run';
  try {
    await shard(Number(shardIndex), runId, `media-load-${runId}`, config);
  } catch (error) {
    process.send?.({
      type: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main().catch(async (error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  await dispose().catch(() => undefined);
  process.exit(1);
});
