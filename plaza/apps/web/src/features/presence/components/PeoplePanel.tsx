import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMembers } from '@/features/spaces';
import { worldEvents, type EventBus } from '@/features/world';
import { useEscapeKey } from '@/shared/ui';

import { peopleLists, type ConnectedRow } from '../lib/people';
import { presenceStore, usePresenceStore, type PresenceStore } from '../store/presence-store';
import { RingButton } from './RingButton';
import { StatusDot } from './StatusDot';

export interface PeoplePanelProps {
  readonly spaceId: string;
  /** Meeting room names by area id, for "En Sala X". */
  readonly roomNames: Readonly<Record<string, string>>;
  readonly onClose: () => void;
  readonly store?: PresenceStore;
  readonly events?: EventBus;
}

/**
 * "Personas" (E7-S2): who is connected (status and meeting room) and, below, the members who
 * are not, with a name search. "Localizar" moves the camera to the person for 3 s; "Llamar"
 * rings them (E7-S5). Opening it puts the focus on the search; `Escape` closes it (E8-S6).
 */
export function PeoplePanel({
  spaceId,
  roomNames,
  onClose,
  store = presenceStore,
  events = worldEvents,
}: PeoplePanelProps) {
  const { t } = useTranslation('presence');
  const [query, setQuery] = useState('');
  const titleId = useId();
  const panelRef = useEscapeKey<HTMLElement>(onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const people = usePresenceStore((state) => state.people, store);
  const selfId = usePresenceStore((state) => state.selfId, store);
  const members = useMembers(spaceId);
  const { connected, disconnected } = useMemo(
    () => peopleLists(people, members.data ?? [], selfId, query),
    [people, members.data, selfId, query],
  );
  const nobody = connected.length === 0 && disconnected.length === 0 && query.trim() !== '';

  return (
    <section
      ref={panelRef}
      aria-labelledby={titleId}
      className="flex h-full w-80 max-w-full flex-col rounded-lg bg-white text-slate-900 shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {t('people.title')}
        </h2>
        <button
          type="button"
          aria-label={t('people.close')}
          className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="px-4 py-3">
        <input
          ref={searchRef}
          type="search"
          aria-label={t('people.search')}
          placeholder={t('people.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {t('people.connected', { count: connected.length })}
        </h3>
        <ul className="mb-4 flex flex-col gap-1">
          {connected.map((row) => (
            <ConnectedItem key={row.userId} row={row} roomNames={roomNames} events={events} />
          ))}
        </ul>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {t('people.disconnected', { count: disconnected.length })}
        </h3>
        <ul className="flex flex-col gap-1">
          {disconnected.map((member) => (
            <li key={member.userId} className="flex items-center gap-2 py-1 text-sm text-slate-600">
              <StatusDot presence="offline" />
              <span className="truncate">{member.displayName}</span>
              <span className="sr-only">{t('status.offline')}</span>
            </li>
          ))}
        </ul>
        {members.isError && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {t('people.loadError')}
          </p>
        )}
        {nobody && (
          <p role="status" className="mt-2 text-sm text-slate-600">
            {t('people.noMatch', { query: query.trim() })}
          </p>
        )}
      </div>
    </section>
  );
}

interface ConnectedItemProps {
  readonly row: ConnectedRow;
  readonly roomNames: Readonly<Record<string, string>>;
  readonly events: EventBus;
}

function ConnectedItem({ row, roomNames, events }: ConnectedItemProps) {
  const { t } = useTranslation('presence');
  const room = row.roomId === null ? undefined : (roomNames[row.roomId] ?? row.roomId);
  const state = row.reconnecting ? t('status.reconnecting') : t(`status.${row.presence}`);
  return (
    <li className="flex items-center gap-2 py-1" data-testid={`person-${row.userId}`}>
      <StatusDot presence={row.presence} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {row.displayName}{' '}
          {row.isSelf && <span className="text-slate-600">{t('people.you')}</span>}
        </span>
        <span className="truncate text-xs text-slate-600">
          {room === undefined ? state : `${state} · ${t('people.inRoom', { name: room })}`}
        </span>
      </div>
      <button
        type="button"
        aria-label={t('people.locateLabel', { name: row.displayName })}
        className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        onClick={() => {
          events.emit('camera:locate', { userId: row.userId });
        }}
      >
        {t('people.locate')}
      </button>
      {!row.isSelf && <RingButton userId={row.userId} displayName={row.displayName} />}
    </li>
  );
}
