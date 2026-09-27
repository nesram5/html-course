import { describe, expect, it, vi } from 'vitest';

import { createConnectionStore } from '../realtime/connection-store';

describe('connectionStore', () => {
  it('starts disconnected without error', () => {
    expect(createConnectionStore().getState()).toMatchObject({
      status: 'disconnected',
      error: null,
    });
  });

  it('stores the status and clears the error unless one is given', () => {
    const store = createConnectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().setStatus('disconnected', 'UNAUTHORIZED');
    expect(store.getState()).toMatchObject({ status: 'disconnected', error: 'UNAUTHORIZED' });
    store.getState().setStatus('connecting');
    expect(store.getState()).toMatchObject({ status: 'connecting', error: null });
    store.getState().setStatus('reconnecting');
    store.getState().setStatus('connected');

    expect(listener.mock.calls.map(([state]) => (state as { status: string }).status)).toEqual([
      'disconnected',
      'connecting',
      'reconnecting',
      'connected',
    ]);
  });
});
