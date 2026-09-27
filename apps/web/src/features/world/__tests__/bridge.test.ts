import { describe, expect, it, vi } from 'vitest';

import { EventBus } from '../bridge/event-bus';
import { nextZoom } from '../game/constants';
import { createWorldStore } from '../store/world-store';

describe('EventBus', () => {
  it('delivers typed payloads and stops after unsubscribing', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const off = bus.on('local:step', listener);
    bus.emit('local:step', { x: 1, y: 2, dir: 'up' });
    off();
    bus.emit('local:step', { x: 1, y: 3, dir: 'down' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ x: 1, y: 2, dir: 'up' });
    expect(bus.listenerCount()).toBe(0);
  });

  it('counts listeners per event and tolerates listeners removing themselves', () => {
    const bus = new EventBus();
    const center = vi.fn();
    const once = bus.on('camera:center', () => {
      once();
    });
    bus.on('camera:center', center);

    expect(bus.listenerCount('camera:center')).toBe(2);
    bus.emit('camera:center');
    bus.emit('camera:center');

    expect(center).toHaveBeenCalledTimes(2);
    expect(bus.listenerCount('camera:center')).toBe(1);
    expect(bus.listenerCount('local:step')).toBe(0);
    bus.off('local:step', center);
  });
});

describe('worldStore', () => {
  it('cycles the zoom between 1×, 1.5× and 2×, clamped at both ends', () => {
    const store = createWorldStore();

    expect(store.getState().zoom).toBe(1.5);
    store.getState().zoomIn();
    store.getState().zoomIn();
    expect(store.getState().zoom).toBe(2);
    store.getState().zoomOut();
    store.getState().zoomOut();
    store.getState().zoomOut();
    expect(store.getState().zoom).toBe(1);
    expect(nextZoom(1, 'out')).toBe(1);
  });

  it('resets the live state but keeps the zoom', () => {
    const store = createWorldStore();
    store.getState().zoomIn();
    store.getState().setLoad({ kind: 'ready' });
    store.getState().setLocalPlayer({ x: 1, y: 1, dir: 'up', roomId: null });

    store.getState().reset();

    expect(store.getState()).toMatchObject({ load: { kind: 'idle' }, localPlayer: null, zoom: 2 });
  });
});
