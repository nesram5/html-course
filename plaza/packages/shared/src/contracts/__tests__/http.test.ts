import { describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AllowedDomainSchema,
  AuthStartQuerySchema,
  ClaimDeskBodySchema,
  CreateSpaceBodySchema,
  DeskDecorSchema,
  EMPTY_DESK_DECOR,
  FeedbackBodySchema,
  HealthResponseSchema,
  MapTemplateIdSchema,
  MediaTokenResponseSchema,
  MeResponseSchema,
  SpaceBansResponseSchema,
  TrackEventBodySchema,
  UpdateMeBodySchema,
  UpdateRoomBodySchema,
  UpdateSpaceBodySchema,
  apiPath,
} from '../http/index.js';

describe('apiPath', () => {
  it('fills and encodes path parameters', () => {
    expect(apiPath(API_PATHS.member, { spaceId: 'sp1', userId: 'u/2' })).toBe(
      '/api/spaces/sp1/members/u%2F2',
    );
    expect(apiPath(API_PATHS.spaceEnterBySlug, { slug: 'acme' })).toBe(
      '/api/spaces/by-slug/acme/enter',
    );
    expect(apiPath(API_PATHS.health, {})).toBe('/api/health');
    expect(apiPath(API_PATHS.ban, { spaceId: 'sp1', userId: 'u2' })).toBe(
      '/api/spaces/sp1/bans/u2',
    );
  });

  it('throws when a parameter is missing at runtime', () => {
    const params: Record<string, string> = {};
    expect(() => apiPath('/api/spaces/:spaceId', params as { spaceId: string })).toThrow(/spaceId/);
  });

  it('only declares /api paths', () => {
    for (const path of Object.values(API_PATHS)) expect(path.startsWith('/api/')).toBe(true);
  });
});

describe('auth and profile', () => {
  it('accepts only relative "next" paths (no open redirect)', () => {
    expect(AuthStartQuerySchema.safeParse({ next: '/s/acme' }).success).toBe(true);
    expect(AuthStartQuerySchema.safeParse({}).success).toBe(true);
    expect(AuthStartQuerySchema.safeParse({ next: '//evil.com' }).success).toBe(false);
    expect(AuthStartQuerySchema.safeParse({ next: '/\\evil.com' }).success).toBe(false);
    expect(AuthStartQuerySchema.safeParse({ next: 'https://evil.com' }).success).toBe(false);
  });

  it('refuses "next" paths that browsers or the Location header would rewrite', () => {
    // Browsers drop tabs and newlines from URLs: "/\t/evil.com" would become "//evil.com".
    for (const next of [
      '/\t/evil.com',
      '/\n/evil.com',
      '/s/acme\r\nSet-Cookie: x',
      '/a b',
      '/a\\b',
    ]) {
      expect(AuthStartQuerySchema.safeParse({ next }).success, JSON.stringify(next)).toBe(false);
    }
    expect(AuthStartQuerySchema.safeParse({ next: '/profile?tab=avatar%20x#top' }).success).toBe(
      true,
    );
  });

  it('requires at least one field when updating the profile', () => {
    expect(UpdateMeBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateMeBodySchema.parse({ displayName: '  Ana  ' })).toEqual({ displayName: 'Ana' });
    expect(UpdateMeBodySchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(UpdateMeBodySchema.safeParse({ avatarId: 'Avatar 1' }).success).toBe(false);
  });

  it('describes the current user', () => {
    const me = {
      id: 'u1',
      email: 'ana@acme.com',
      displayName: 'Ana',
      avatarId: 'avatar-01',
      avatarChosen: false,
      pictureUrl: null,
    };
    expect(MeResponseSchema.parse({ user: me })).toEqual({ user: me });
  });
});

describe('spaces', () => {
  it('validates template ids with version', () => {
    expect(MapTemplateIdSchema.safeParse('office-small@1').success).toBe(true);
    expect(MapTemplateIdSchema.safeParse('office-small').success).toBe(false);
    expect(
      CreateSpaceBodySchema.safeParse({ name: 'Oficina Acme', mapTemplateId: 'campus@1' }).success,
    ).toBe(true);
  });

  it('normalises allowed domains', () => {
    expect(AllowedDomainSchema.parse(' Acme.COM ')).toBe('acme.com');
    expect(AllowedDomainSchema.safeParse('@acme.com').success).toBe(false);
    expect(AllowedDomainSchema.safeParse('localhost').success).toBe(false);
  });

  it('accepts clearing the domain and rejects empty updates', () => {
    expect(UpdateSpaceBodySchema.safeParse({ allowedDomain: null }).success).toBe(true);
    expect(UpdateSpaceBodySchema.safeParse({ themeId: 'watercolor' }).success).toBe(true);
    expect(UpdateSpaceBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('rooms, media and desks', () => {
  it('only accepts Google Meet links', () => {
    expect(
      UpdateRoomBodySchema.safeParse({ meetUri: 'https://meet.google.com/abc-defg-hij' }).success,
    ).toBe(true);
    expect(UpdateRoomBodySchema.safeParse({ meetUri: 'https://zoom.us/j/1' }).success).toBe(false);
  });

  it('returns a websocket URL for media', () => {
    expect(
      MediaTokenResponseSchema.safeParse({ url: 'wss://lk.example.com', token: 't' }).success,
    ).toBe(true);
    expect(MediaTokenResponseSchema.safeParse({ url: 'https://x', token: 't' }).success).toBe(
      false,
    );
  });

  it('requires exactly three decoration slots (RN-15)', () => {
    expect(DeskDecorSchema.safeParse(EMPTY_DESK_DECOR).success).toBe(true);
    expect(DeskDecorSchema.safeParse({ slots: ['plant', null, 'lamp'] }).success).toBe(true);
    expect(DeskDecorSchema.safeParse({ slots: ['plant', 'lamp', 'mug', 'cat'] }).success).toBe(
      false,
    );
    expect(ClaimDeskBodySchema.parse({})).toEqual({});
  });
});

describe('misc', () => {
  it('validates in-app feedback (E8-S7)', () => {
    expect(FeedbackBodySchema.parse({ message: '  Muy útil  ', rating: 5 })).toEqual({
      message: 'Muy útil',
      rating: 5,
    });
    expect(FeedbackBodySchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(FeedbackBodySchema.safeParse({ message: 'ok', rating: 6 }).success).toBe(false);
    expect(FeedbackBodySchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('validates product events and health', () => {
    expect(TrackEventBodySchema.safeParse({ name: 'room_meet_opened' }).success).toBe(true);
    expect(TrackEventBodySchema.safeParse({ name: 'clicked' }).success).toBe(false);
    expect(
      HealthResponseSchema.safeParse({
        status: 'ok',
        version: '0.1.0',
        realtime: { connectedBySpace: {}, avgTickMs: null },
      }).success,
    ).toBe(true);
  });
});

describe('space bans (E2-S6 follow-up)', () => {
  it('lists removed people with their profile and the date of the ban', () => {
    const ban = {
      userId: 'u2',
      displayName: 'Luis',
      avatarId: 'avatar-02',
      email: 'luis@acme.com',
      createdAt: '2026-09-27T10:00:00.000Z',
    };
    expect(SpaceBansResponseSchema.parse({ bans: [ban] }).bans).toEqual([ban]);
    expect(SpaceBansResponseSchema.safeParse({ bans: [{ ...ban, email: 'nope' }] }).success).toBe(
      false,
    );
  });
});
