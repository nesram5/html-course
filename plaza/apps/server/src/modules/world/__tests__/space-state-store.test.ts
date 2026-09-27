import { SPACE_UNLOAD_DELAY_MS, type WorldMap } from '@plaza/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { ManualTimers } from '../../../test/manual-timers.js';
import { packageMapsCatalog } from '../../../test/maps-fixture.js';
import { SpaceRuntime } from '../space-runtime.js';
import { InMemorySpaceStateStore } from '../space-state-store.js';
import { deltaFor } from '../world.service.js';

let map: WorldMap;

beforeAll(async () => {
  map = await packageMapsCatalog().worldMap('office-small@1');
});

function setup() {
  const timers = new ManualTimers();
  const loads: string[] = [];
  const events: string[] = [];
  const store = new InMemorySpaceStateStore({
    timers,
    load: (spaceId) => {
      loads.push(spaceId);
      return Promise.resolve(new SpaceRuntime(spaceId, 'office-small@1', map));
    },
    onLoad: (runtime) => events.push(`load:${runtime.spaceId}`),
    onUnload: (runtime) => events.push(`unload:${runtime.spaceId}`),
  });
  return { timers, loads, events, store };
}

function addPlayer(runtime: SpaceRuntime, userId: string): void {
  runtime.join(
    {
      userId,
      displayName: userId,
      avatarId: 'avatar-01',
      status: 'available',
      away: false,
      inConversation: false,
    },
    runtime.spawnFor(null),
    `socket-${userId}`,
  );
}

describe('InMemorySpaceStateStore (E4-S2)', () => {
  it('creates the runtime once, even for concurrent first entries', async () => {
    const { store, loads, events } = setup();

    const [a, b] = await Promise.all([store.getOrLoad('s1'), store.getOrLoad('s1')]);
    const c = await store.getOrLoad('s1');

    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(loads).toEqual(['s1']);
    expect(events).toEqual(['load:s1']);
    expect(store.get('s1')).toBe(a);
    expect(store.runtimes()).toEqual([a]);
  });

  it('releases an empty runtime 60 s after the last person leaves', async () => {
    const { store, timers, events } = setup();
    const runtime = await store.getOrLoad('s1');
    addPlayer(runtime, 'ana');
    store.unloadIfEmpty('s1');
    expect(timers.pending).toBe(0);

    runtime.leave('ana');
    store.unloadIfEmpty('s1');
    store.unloadIfEmpty('s1');
    timers.advance(SPACE_UNLOAD_DELAY_MS - 1);
    const stillLoaded = store.get('s1');
    timers.advance(1);

    expect(stillLoaded).toBe(runtime);
    expect(store.get('s1')).toBeUndefined();
    expect(events).toEqual(['load:s1', 'unload:s1']);
  });

  it('keeps the runtime when someone enters before the delay ends', async () => {
    const { store, timers, loads } = setup();
    const runtime = await store.getOrLoad('s1');
    store.unloadIfEmpty('s1');
    timers.advance(SPACE_UNLOAD_DELAY_MS / 2);

    const again = await store.getOrLoad('s1');
    timers.advance(SPACE_UNLOAD_DELAY_MS);

    expect(again).toBe(runtime);
    expect(store.get('s1')).toBe(runtime);
    expect(loads).toEqual(['s1']);
  });

  it('loads a fresh runtime (and the map again) after a release', async () => {
    const { store, timers, loads } = setup();
    const first = await store.getOrLoad('s1');
    store.unloadIfEmpty('s1');
    timers.advance(SPACE_UNLOAD_DELAY_MS);

    const second = await store.getOrLoad('s1');

    expect(second).not.toBe(first);
    expect(loads).toEqual(['s1', 's1']);
  });

  it('does not release a runtime that is occupied again when the delay ends', async () => {
    const { store, timers } = setup();
    const runtime = await store.getOrLoad('s1');
    store.unloadIfEmpty('s1');
    addPlayer(runtime, 'ana');

    timers.advance(SPACE_UNLOAD_DELAY_MS);

    expect(store.get('s1')).toBe(runtime);
  });

  it('retries the load after a failure', async () => {
    const timers = new ManualTimers();
    let attempts = 0;
    const store = new InMemorySpaceStateStore({
      timers,
      load: (spaceId) => {
        attempts++;
        return attempts === 1
          ? Promise.reject(new Error('map not found'))
          : Promise.resolve(new SpaceRuntime(spaceId, 'office-small@1', map));
      },
    });

    await expect(store.getOrLoad('s1')).rejects.toThrow('map not found');
    await expect(store.getOrLoad('s1')).resolves.toBeInstanceOf(SpaceRuntime);
  });

  it('drops every runtime and pending release on close', async () => {
    const { store, timers, events } = setup();
    await store.getOrLoad('s1');
    await store.getOrLoad('s2');
    store.unloadIfEmpty('s1');

    store.close();

    expect(store.runtimes()).toEqual([]);
    expect(timers.pending).toBe(0);
    expect(events).toEqual(['load:s1', 'load:s2', 'unload:s1', 'unload:s2']);
  });
});

describe('deltaFor', () => {
  const delta = {
    moved: [
      { userId: 'ana', x: 1, y: 1, dir: 'up' as const },
      { userId: 'luis', x: 2, y: 2, dir: 'down' as const },
    ],
    joined: [],
    left: ['eva'],
    changed: [{ userId: 'ana', roomId: 'sala-1' }],
  };

  it('leaves out the steps of the recipient but keeps their own changes', () => {
    expect(deltaFor(delta, 'ana')).toEqual({
      moved: [{ userId: 'luis', x: 2, y: 2, dir: 'down' }],
      joined: [],
      left: ['eva'],
      changed: [{ userId: 'ana', roomId: 'sala-1' }],
    });
  });

  it('leaves out the arrivals the recipient already got in its snapshot', () => {
    const player = (userId: string) => ({
      userId,
      displayName: userId,
      avatarId: 'avatar-01',
      x: 1,
      y: 1,
      dir: 'down' as const,
      status: 'available' as const,
      away: false,
      roomId: null,
      inConversation: false,
      reconnecting: false,
    });
    const arrivals = {
      moved: [],
      joined: [player('a'), player('b'), player('c')],
      left: [],
      changed: [],
    };

    expect(deltaFor(arrivals, 'b')?.joined.map((p) => p.userId)).toEqual(['c']);
    expect(deltaFor(arrivals, 'c')).toBeNull();
    expect(deltaFor(arrivals, 'z')?.joined).toHaveLength(3);
  });

  it('sends nothing when the only news is the recipient themselves', () => {
    expect(
      deltaFor({ moved: [delta.moved[0]!], joined: [], left: [], changed: [] }, 'ana'),
    ).toBeNull();
  });
});
