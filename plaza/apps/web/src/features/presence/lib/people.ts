import { effectivePresence, type EffectivePresence } from '@plaza/shared';

import type { PresencePerson } from '../store/presence-store';

/** A member of the space, as the REST members list gives them. */
export interface MemberLike {
  readonly userId: string;
  readonly displayName: string;
}

export interface ConnectedRow {
  readonly userId: string;
  readonly displayName: string;
  readonly presence: EffectivePresence;
  readonly reconnecting: boolean;
  readonly roomId: string | null;
  readonly isSelf: boolean;
}

export interface PeopleLists {
  readonly connected: readonly ConnectedRow[];
  readonly disconnected: readonly MemberLike[];
}

/** Case- and accent-insensitive form of a name, for the search box. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}

const byName = (a: { displayName: string }, b: { displayName: string }) =>
  a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base' });

/**
 * The "Personas" panel (E7-S2): connected people first (me on top, then by name), then the
 * members who are not connected, both filtered by `query`.
 */
export function peopleLists(
  people: Readonly<Record<string, PresencePerson>>,
  members: readonly MemberLike[],
  selfId: string | null,
  query: string,
): PeopleLists {
  const needle = normalizeName(query.trim());
  const matches = (name: string) => needle === '' || normalizeName(name).includes(needle);
  const connected = Object.values(people)
    .filter((person) => matches(person.displayName))
    .map((person) => ({
      userId: person.userId,
      displayName: person.displayName,
      presence: effectivePresence(person),
      reconnecting: person.reconnecting,
      roomId: person.roomId,
      isSelf: person.userId === selfId,
    }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || byName(a, b));
  const disconnected = members
    .filter((member) => people[member.userId] === undefined && matches(member.displayName))
    .sort(byName);
  return { connected, disconnected };
}
