import { apiPath, WEB_PATHS, type SpaceDetailDto } from '@plaza/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarSprite, useAvatars, useSession } from '@/features/auth';
import { errorMessageKey } from '@/shared/api';
import { toast } from '@/shared/ui';

import { spacesKeys } from '../api/spaces-api';
import { useSpaceSettingsExtensions } from '../extensions';
import { useMapTemplates, useMembers, useRemoveMember, useSetMemberRole } from '../hooks/useSpaces';
import { ConfirmAction } from './ConfirmAction';

/**
 * Owner panel: name, avatar, e-mail, role and desk of every member, with "Hacer administrador/a"
 * (hands the administration over, so nobody is locked in as the only owner, E8-S6) and
 * "Expulsar" (E2-S6). The desk column (assignment, "Ir a su escritorio", E9-S2) comes from `personalization` through
 * {@link useSpaceSettingsExtensions}.
 */
export function MembersPanel({ space }: { space: SpaceDetailDto }) {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const titleId = useId();
  const spaceId = space.id;
  const queryClient = useQueryClient();
  const members = useMembers(spaceId);
  const avatars = useAvatars();
  const session = useSession();
  const remove = useRemoveMember(spaceId);
  const setRole = useSetMemberRole(spaceId);
  const templates = useMapTemplates();
  const mapUrl = templates.data?.find((template) => template.id === space.mapTemplateId)?.mapUrl;
  const { MemberDeskCell } = useSpaceSettingsExtensions();
  const avatarById = new Map((avatars.data ?? []).map((avatar) => [avatar.id, avatar]));
  const taken = new Set((members.data ?? []).flatMap((m) => (m.deskId === null ? [] : [m.deskId])));
  const spacePath = apiPath(WEB_PATHS.space, { slug: space.slug });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: spacesKeys.members(spaceId) });
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} tabIndex={-1} className="text-lg font-semibold">
        {t('members.title')}
      </h2>
      {members.isPending && (
        <p role="status" className="text-sm text-slate-600">
          {t('members.loading')}
        </p>
      )}
      {members.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
          <p>{tc(errorMessageKey(members.error))}</p>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-slate-800"
            onClick={() => {
              void members.refetch();
            }}
          >
            {tc('errorBoundary.retry')}
          </button>
        </div>
      )}
      {members.isSuccess && (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-600">
            <tr>
              <th scope="col">{t('members.name')}</th>
              <th scope="col">{t('members.email')}</th>
              <th scope="col">{t('members.role')}</th>
              {MemberDeskCell !== undefined && <th scope="col">{t('members.desk')}</th>}
              <th scope="col">
                <span className="sr-only">{t('members.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.data.map((member) => {
              const avatar = avatarById.get(member.avatarId);
              const isMe = member.userId === session.user?.id;
              return (
                <tr key={member.userId} className="border-t border-slate-200">
                  <td className="flex items-center gap-2 py-2">
                    {avatar !== undefined && (
                      <AvatarSprite avatar={avatar} scale={1} walking={false} />
                    )}
                    <span>
                      {member.displayName} {isMe && t('members.you')}
                    </span>
                  </td>
                  <td>{member.email}</td>
                  <td>{t(`role.${member.role}`)}</td>
                  {MemberDeskCell !== undefined && (
                    <td>
                      <MemberDeskCell
                        spaceId={spaceId}
                        spacePath={spacePath}
                        mapUrl={mapUrl}
                        member={member}
                        takenDeskIds={taken}
                        onChanged={refresh}
                      />
                    </td>
                  )}
                  <td className="flex flex-wrap justify-end gap-2 py-2">
                    {!isMe && member.role !== 'OWNER' && (
                      <ConfirmAction
                        label={t('members.makeOwner')}
                        question={t('members.makeOwnerConfirm', { name: member.displayName })}
                        disabled={setRole.isPending}
                        onConfirm={() => {
                          setRole.mutate(
                            { userId: member.userId, role: 'OWNER' },
                            {
                              onSuccess: () =>
                                toast.success(t('members.madeOwner', { name: member.displayName })),
                              onError: (error) => toast.error(tc(errorMessageKey(error))),
                            },
                          );
                        }}
                      />
                    )}
                    {!isMe && member.role !== 'OWNER' && (
                      <ConfirmAction
                        danger
                        label={t('members.kick')}
                        question={t('members.kickConfirm', { name: member.displayName })}
                        disabled={remove.isPending}
                        // The row goes away with the member: the focus waits on the heading.
                        focusAfterConfirm={() => document.getElementById(titleId)}
                        onConfirm={() => {
                          remove.mutate(member.userId, {
                            onSuccess: () =>
                              toast.success(t('members.kicked', { name: member.displayName })),
                          });
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
