import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

import { PROTOCOL_VERSION } from '../../constants.js';
import {
  CLIENT_EVENT_SCHEMAS,
  PlayerChangedSchema,
  PlayerMoveSchema,
  SERVER_EVENT_SCHEMAS,
  SpaceSnapshotSchema,
  ackSchema,
  type ClientEventName,
  type ClientEventPayload,
  type PlayerState,
  type ServerEventName,
  type ServerEventPayload,
} from '../realtime/index.js';

const player: PlayerState = {
  userId: 'u1',
  displayName: 'Ana',
  avatarId: 'avatar-01',
  x: 3,
  y: 4,
  dir: 'down',
  status: 'available',
  away: false,
  roomId: null,
  inConversation: false,
  reconnecting: false,
};

describe('realtime contracts', () => {
  it('declares a schema for every event of the typed interfaces', () => {
    expectTypeOf<keyof typeof CLIENT_EVENT_SCHEMAS>().toEqualTypeOf<ClientEventName>();
    expectTypeOf<keyof typeof SERVER_EVENT_SCHEMAS>().toEqualTypeOf<ServerEventName>();
    expectTypeOf<z.infer<(typeof CLIENT_EVENT_SCHEMAS)['player:move']>>().toEqualTypeOf<
      ClientEventPayload<'player:move'>
    >();
    expectTypeOf<z.infer<(typeof SERVER_EVENT_SCHEMAS)['world:delta']>>().toEqualTypeOf<
      ServerEventPayload<'world:delta'>
    >();
    expect(Object.keys(CLIENT_EVENT_SCHEMAS)).toHaveLength(8);
    expect(Object.keys(SERVER_EVENT_SCHEMAS)).toHaveLength(11);
  });

  it('carries the protocol version in client payloads', () => {
    expect(PlayerMoveSchema.safeParse({ v: PROTOCOL_VERSION, x: 1, y: 2, dir: 'up' }).success).toBe(
      true,
    );
    expect(PlayerMoveSchema.safeParse({ x: 1, y: 2, dir: 'up' }).success).toBe(false);
    expect(PlayerMoveSchema.safeParse({ v: 1, x: 1.5, y: 2, dir: 'up' }).success).toBe(false);
  });

  it('validates a snapshot and partial player changes', () => {
    const snapshot = {
      v: PROTOCOL_VERSION,
      spaceId: 's1',
      mapTemplateId: 'office-small@1',
      themeId: 'pixel',
      self: player,
      players: [],
      rooms: [{ areaId: 'sala-1', name: 'Sala 1', meetUri: null, source: null }],
      desks: [],
    };
    expect(SpaceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(PlayerChangedSchema.safeParse({ userId: 'u1', away: true }).success).toBe(true);
    expect(PlayerChangedSchema.safeParse({ away: true }).success).toBe(false);
  });

  it('builds ack schemas', () => {
    const schema = ackSchema(SERVER_EVENT_SCHEMAS['media:peers']);
    expect(schema.safeParse({ ok: true, data: { peers: ['u2'] } }).success).toBe(true);
    expect(
      schema.safeParse({ ok: false, error: { code: 'NOT_A_MEMBER', message: 'no' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ ok: true }).success).toBe(false);
  });
});
