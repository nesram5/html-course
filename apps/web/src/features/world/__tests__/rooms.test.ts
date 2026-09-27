import { describe, expect, it, vi } from 'vitest';

import { occupiedKey, peopleInRoom, roomOccupancy } from '../game/rooms/room-occupancy';
import { InteractionKeys, isInteractKey } from '../interaction/interaction-keys';
import { createWorldStore } from '../store/world-store';
import { testPlayer, testSnapshot } from './fixtures';

describe('meeting room occupancy (E6-S4)', () => {
  it('counts people per room from the avatars on the map, the local person included', () => {
    const players = [
      { roomId: 'sala-1' },
      { roomId: null },
      { roomId: 'sala-1' },
      { roomId: 'sala-2' },
    ];

    const occupancy = roomOccupancy(players, 'sala-2');

    expect(Object.fromEntries(occupancy)).toEqual({ 'sala-1': 2, 'sala-2': 2 });
    expect(roomOccupancy([{ roomId: null }], null).size).toBe(0);
    expect(occupiedKey(occupancy)).toBe('sala-1|sala-2');
  });

  it('counts the people in the local person’s room from the world store', () => {
    const world = createWorldStore();
    world.getState().applySnapshot(
      testSnapshot({
        players: [
          testPlayer({ userId: 'user-2', roomId: 'sala-1' }),
          testPlayer({ userId: 'user-3', roomId: null }),
        ],
      }),
    );
    world.getState().setLocalPlayer({ x: 1, y: 1, dir: 'down', roomId: 'sala-1' });

    expect(peopleInRoom(world.getState(), 'sala-1')).toBe(2);
    world.getState().applyDelta({
      moved: [],
      joined: [],
      left: [],
      changed: [{ userId: 'user-3', roomId: 'sala-1' }],
    });
    expect(peopleInRoom(world.getState(), 'sala-1')).toBe(3);
    expect(peopleInRoom(world.getState(), 'sala-2')).toBe(0);
  });
});

function keydown(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('interaction key dispatcher (X)', () => {
  it('runs only the interaction with the highest priority, once per press', () => {
    const keys = new InteractionKeys();
    const desk = vi.fn();
    const room = vi.fn();
    const offDesk = keys.register({ id: 'desk', priority: 10, run: desk });
    const offRoom = keys.register({ id: 'meeting-room', priority: 20, run: room });
    expect(keys.store.getState().active).toBe('meeting-room');

    const event = keydown('x');

    expect(room).toHaveBeenCalledTimes(1);
    expect(desk).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    offRoom();
    expect(keys.store.getState().active).toBe('desk');
    keydown('X');
    expect(desk).toHaveBeenCalledTimes(1);
    expect(room).toHaveBeenCalledTimes(1);
    offDesk();
  });

  it('ignores X with modifiers, repeated or typed in a text field', () => {
    const keys = new InteractionKeys();
    const run = vi.fn();
    const off = keys.register({ id: 'desk', priority: 10, run });
    const input = document.createElement('input');
    document.body.append(input);

    keydown('x', { ctrlKey: true });
    keydown('x', { repeat: true });
    keydown('x', {}, input);
    keydown('d');

    expect(run).not.toHaveBeenCalled();
    expect(isInteractKey(new KeyboardEvent('keydown', { key: 'x' }))).toBe(true);
    input.remove();
    off();
  });

  it('listens to the keyboard only while something is registered', () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const keys = new InteractionKeys(() => target);

    const off = keys.register({ id: 'a', priority: 1, run: vi.fn() });
    const offB = keys.register({ id: 'b', priority: 1, run: vi.fn() });
    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    // Equal priorities: the earliest registered wins.
    expect(keys.active()?.id).toBe('a');

    off();
    off(); // idempotent
    expect(target.removeEventListener).not.toHaveBeenCalled();
    offB();
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
    expect(keys.store.getState().active).toBeNull();
    expect(keys.trigger()).toBe(false);
  });
});
