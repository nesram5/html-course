import { apiPath, WEB_PATHS, type SpaceDetailDto } from '@plaza/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarSprite, useAvatars, useSession } from '@/features/auth';
import { MemberDeskControls, useMapDeskIds } from '@/features/personalization';
import { toast } from '@/shared/ui';

import { spacesKeys } from '../api/spaces-api';
import { useMapTemplates, useMembers, useRemoveMember } from '../hooks/useSpaces';
import { ConfirmAction } from './ConfirmAction';

/**
 * Owner panel: name, avatar, e-mail, role and desk of every member, with "Expulsar" (E2-S6) and
 * desk assignment / "Ir a su escritorio" (E9-S2).
 */
export function MembersPanel({ space }: { space: SpaceDetailDto }) {
  const { t } = useTranslation('spaces');
  const titleId = useId();
  const spaceId = space.id;
  const queryClient = useQueryClient();
  const members = useMembers(spaceId);
  const avatars = useAvatars();
  const session = useSession();
  const remove = useRemoveMember(spaceId);
  const templates = useMapTemplates();
  const mapUrl = templates.data?.find((template) => template.id === space.mapTemplateId)?.mapUrl;
  const deskIds = useMapDeskIds(mapUrl);
  const avatarById = new Map((avatars.data ?? []).map((avatar) => [avatar.id, avatar]));
  const taken = new Set((members.data ?? []).flatMap((m) => (m.deskId === null ? [] : [m.deskId])));
  const spacePath = apiPath(WEB_PATHS.space, { slug: space.slug });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: spacesKeys.members(spaceId) });
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('members.title')}
      </h2>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th scope="col">{t('members.name')}</th>
            <th scope="col">{t('members.email')}</th>
            <th scope="col">{t('members.role')}</th>
            <th scope="col">{t('members.desk')}</th>
            <th scope="col">
              <span className="sr-only">{t('members.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(members.data ?? []).map((member) => {
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
                <td>
                  <MemberDeskControls
                    spaceId={spaceId}
                    spacePath={spacePath}
                    member={member}
                    deskId={member.deskId}
                    deskIds={deskIds.data ?? []}
                    takenDeskIds={taken}
                    onChanged={refresh}
                  />
                </td>
                <td className="text-right">
                  {!isMe && member.role !== 'OWNER' && (
                    <ConfirmAction
                      danger
                      label={t('members.kick')}
                      question={t('members.kickConfirm', { name: member.displayName })}
                      disabled={remove.isPending}
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
    </section>
  );
}
