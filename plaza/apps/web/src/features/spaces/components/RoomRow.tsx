import { MeetUriSchema, type MeetingRoomDto } from '@plaza/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/shared/ui';

import { useUpdateRoomLink } from '../hooks/useSpaces';
import { FormError } from './FormError';

interface RoomRowProps {
  spaceId: string;
  room: MeetingRoomDto;
  canEdit: boolean;
}

/** A meeting room with its Meet link, "Probar" and the manual link form (E2-S7). */
export function RoomRow({ spaceId, room, canEdit }: RoomRowProps) {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [meetUri, setMeetUri] = useState(room.meetUri ?? '');
  const [invalid, setInvalid] = useState(false);
  const update = useUpdateRoomLink(spaceId);

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = meetUri.trim();
    if (!MeetUriSchema.safeParse(value).success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    update.mutate(
      { areaId: room.areaId, meetUri: value },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(t('rooms.saved'));
        },
      },
    );
  };

  return (
    <li className="flex flex-col gap-2 border-t border-slate-200 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{room.name}</span>
        {room.meetUri === null ? (
          <span className="text-sm text-slate-500">{t('rooms.noLink')}</span>
        ) : (
          <>
            <span className="font-mono text-sm text-slate-700">{room.meetUri}</span>
            <span className="text-xs text-slate-500">
              {t(room.source === 'manual' ? 'rooms.sourceManual' : 'rooms.sourceApi')}
            </span>
            <a
              href={room.meetUri}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('rooms.tryLabel', { name: room.name })}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              {t('rooms.try')}
            </a>
          </>
        )}
        {canEdit && !editing && (
          <button
            type="button"
            className="text-sm text-brand-700 underline"
            onClick={() => {
              setEditing(true);
            }}
          >
            {t('rooms.edit')}
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="flex flex-wrap items-start gap-2" noValidate>
          <label htmlFor={inputId} className="sr-only">
            {t('rooms.editLabel', { name: room.name })}
          </label>
          <div className="flex flex-col gap-1">
            <input
              id={inputId}
              type="url"
              value={meetUri}
              placeholder="https://meet.google.com/abc-defg-hij"
              aria-invalid={invalid}
              aria-describedby={invalid ? `${inputId}-error` : undefined}
              onChange={(event) => {
                setMeetUri(event.target.value);
              }}
              className="w-80 rounded-md border border-slate-300 px-3 py-1 font-mono text-sm"
            />
            {invalid && (
              <p id={`${inputId}-error`} role="alert" className="text-sm text-red-700">
                {tc('errors.INVALID_MEET_URI')}
              </p>
            )}
            {!invalid && <FormError error={update.error} />}
          </div>
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white"
          >
            {t('rooms.save')}
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-sm"
            onClick={() => {
              setEditing(false);
              setInvalid(false);
            }}
          >
            {t('rooms.cancel')}
          </button>
        </form>
      )}
    </li>
  );
}
