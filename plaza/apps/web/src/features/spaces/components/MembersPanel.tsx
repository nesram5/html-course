import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarSprite, useAvatars, useSession } from '@/features/auth';
import { toast } from '@/shared/ui';

import { useMembers, useRemoveMember } from '../hooks/useSpaces';
import { ConfirmAction } from './ConfirmAction';

/** Owner panel: name, avatar, e-mail and role of every member, with "Expulsar" (E2-S6). */
export function MembersPanel({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation('spaces');
  const titleId = useId();
  const members = useMembers(spaceId);
  const avatars = useAvatars();
  const session = useSession();
  const remove = useRemoveMember(spaceId);
  const avatarById = new Map((avatars.data ?? []).map((avatar) => [avatar.id, avatar]));

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
