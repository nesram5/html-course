import { CRITICAL_OUTAGE_MS, TELEMETRY_MAX_SAMPLES, type TelemetrySample } from '@bululu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { mediaStore } from '@/features/media';
import type { ConnectionState, SessionState, SpaceSessionState } from '@/features/world';
import { markInviteOpened, takeInviteElapsed } from '@/shared/lib/join-timing';

import { OfficeTelemetry } from '../lib/office-telemetry';
import { TELEMETRY_FLUSH_MS, TelemetryClient } from '../lib/telemetry';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('join timing (O5)', () => {
  it('counts from the first opening of the invitation, once', () => {
    const storage = memoryStorage();
    markInviteOpened(1000, storage);
    // Back from the Google sign-in: the first mark is kept.
    markInviteOpened(9000, storage);

    expect(takeInviteElapsed(21_000, storage)).toBe(20_000);
    expect(takeInviteElapsed(22_000, storage)).toBeNull();
  });

  it('ignores a mark from another, older journey', () => {
    const storage = memoryStorage();
    markInviteOpened(0, storage);
    expect(takeInviteElapsed(11 * 60_000, storage)).toBeNull();
  });
});

describe('TelemetryClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const sample: TelemetrySample = { metric: 'av_first_frame', spaceId: 's1', valueMs: 500 };

  it('batches samples for a few seconds and never throws on failures', async () => {
    const send = vi.fn(() => Promise.reject(new Error('offline')));
    const client = new TelemetryClient(send);

    client.record(sample);
    client.record(sample);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TELEMETRY_FLUSH_MS);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([sample, sample], false);
    await Promise.resolve();
    expect(client.pending).toBe(0);
  });

  it('sends full batches at once and the rest with keepalive when leaving', () => {
    const send = vi.fn(() => Promise.resolve());
    const client = new TelemetryClient(send);

    for (let i = 0; i < TELEMETRY_MAX_SAMPLES + 1; i++) client.record(sample);
    expect(send).toHaveBeenCalledTimes(1);
    client.flush(true);

    expect(send).toHaveBeenLastCalledWith([sample], true);
  });
});

describe('OfficeTelemetry (O3, O4, O5)', () => {
  let session: StoreApi<SessionState>;
  let connection: StoreApi<ConnectionState>;
  let recorded: TelemetrySample[];
  let probe: OfficeTelemetry;

  function setSession(value: SpaceSessionState) {
    session.getState().set(value);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    session = createStore<SessionState>()((set) => ({
      session: { kind: 'joining' },
      set: (value) => {
        set({ session: value });
      },
    }));
    connection = createStore<ConnectionState>()((set) => ({
      status: 'connected',
      error: null,
      setStatus: (status, error = null) => {
        set({ status, error });
      },
    }));
    mediaStore.getState().reset();
    recorded = [];
    probe = new OfficeTelemetry({
      spaceId: 's1',
      session,
      connection,
      media: mediaStore,
      record: (sample) => recorded.push(sample),
      takeJoinElapsed: () => 18_000,
      sessionKey: 'visit-0001',
    });
    probe.start();
  });

  afterEach(() => {
    probe.stop();
    mediaStore.getState().reset();
    vi.useRealTimers();
  });

  it('starts the visit once joined, with the time from the invitation', () => {
    setSession({ kind: 'joined' });
    setSession({ kind: 'joining' });
    setSession({ kind: 'joined' });

    expect(recorded).toEqual([
      { metric: 'session_started', spaceId: 's1', sessionKey: 'visit-0001' },
      { metric: 'join_time', spaceId: 's1', valueMs: 18_000 },
    ]);
  });

  it('reports a connection lost for more than 30 s, but not a short cut', () => {
    setSession({ kind: 'joined' });
    recorded.length = 0;

    connection.getState().setStatus('reconnecting');
    vi.advanceTimersByTime(CRITICAL_OUTAGE_MS - 1);
    connection.getState().setStatus('connected');
    vi.advanceTimersByTime(CRITICAL_OUTAGE_MS);
    expect(recorded).toEqual([]);

    connection.getState().setStatus('reconnecting');
    connection.getState().setStatus('disconnected');
    vi.advanceTimersByTime(CRITICAL_OUTAGE_MS);
    expect(recorded).toEqual([
      { metric: 'session_error', spaceId: 's1', sessionKey: 'visit-0001', kind: 'connection_lost' },
    ]);
  });

  it('reports hallway media that does not come back, and first frames', () => {
    setSession({ kind: 'joined' });
    recorded.length = 0;

    mediaStore.getState().recordFirstFrame(812.4);
    mediaStore.getState().patch({ connection: 'reconnecting' });
    vi.advanceTimersByTime(CRITICAL_OUTAGE_MS);

    expect(recorded).toEqual([
      { metric: 'av_first_frame', spaceId: 's1', valueMs: 812 },
      { metric: 'session_error', spaceId: 's1', sessionKey: 'visit-0001', kind: 'media_lost' },
    ]);
  });

  it('does not count being removed or replaced by another tab as an error', () => {
    setSession({ kind: 'joined' });
    recorded.length = 0;

    connection.getState().setStatus('reconnecting');
    setSession({ kind: 'kicked', reason: 'SESSION_REPLACED' });
    connection.getState().setStatus('disconnected');
    mediaStore.getState().patch({ connection: 'reconnecting' });
    vi.advanceTimersByTime(CRITICAL_OUTAGE_MS * 2);

    expect(recorded).toEqual([]);
  });
});
