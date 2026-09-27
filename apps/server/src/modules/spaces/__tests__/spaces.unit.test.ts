import type { MeetingRoom } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { deriveInviteToken } from '../invite-token.js';
import { inviteUrl } from '../invite-url.js';
import { mergeRooms } from '../space-rooms.js';
import { firstFreeSlug, slugify } from '../slug.js';

describe('slugify', () => {
  it.each([
    ['Oficina Acme', 'oficina-acme'],
    ['  ¡Ñandú Café! ', 'nandu-cafe'],
    ['Équipe — Paris 2026', 'equipe-paris-2026'],
    ['***', 'espacio'],
    ['a'.repeat(100), 'a'.repeat(60)],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('never ends in a dash after truncation', () => {
    expect(slugify(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
  });

  it('picks the first free suffix', () => {
    expect(firstFreeSlug('acme', new Set())).toBe('acme');
    expect(firstFreeSlug('acme', new Set(['acme', 'acme-2', 'acme-4']))).toBe('acme-3');
  });
});

describe('invite tokens', () => {
  it('derive a stable, url-safe token per space and version', () => {
    const token = deriveInviteToken('secret', 'space-1', 1);

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(deriveInviteToken('secret', 'space-1', 1)).toBe(token);
    expect(deriveInviteToken('secret', 'space-1', 2)).not.toBe(token);
    expect(deriveInviteToken('other', 'space-1', 1)).not.toBe(token);
    expect(inviteUrl('https://bululu.test', token)).toBe(`https://bululu.test/join/${token}`);
  });
});

describe('mergeRooms', () => {
  const record = (areaId: string, source: string): MeetingRoom => ({
    id: `id-${areaId}`,
    spaceId: 's',
    areaId,
    meetUri: `https://meet.google.com/${areaId}`,
    source,
  });

  it('lists the map rooms with their links and keeps orphan links', () => {
    const rooms = mergeRooms(
      [
        { areaId: 'a', name: 'Sala A' },
        { areaId: 'b', name: 'Sala B' },
      ],
      [record('b', 'api'), record('old', 'manual')],
    );

    expect(rooms).toEqual([
      { areaId: 'a', name: 'Sala A', meetUri: null, source: null },
      { areaId: 'b', name: 'Sala B', meetUri: 'https://meet.google.com/b', source: 'api' },
      { areaId: 'old', name: 'old', meetUri: 'https://meet.google.com/old', source: 'manual' },
    ]);
  });
});
