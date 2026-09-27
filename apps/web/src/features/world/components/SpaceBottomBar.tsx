import type { AvatarDto } from '@bululu/shared';
import { useTranslation } from 'react-i18next';

import { AvatarSprite } from '@/features/auth';

import type { SpaceExtension, SpaceInfo } from '../extensions';

export interface SpaceBottomBarProps {
  readonly space: SpaceInfo;
  readonly avatar: Pick<AvatarDto, 'spriteUrl' | 'frameWidth' | 'frameHeight'> | undefined;
  readonly extensions: readonly SpaceExtension[];
}

/**
 * The bar at the bottom of the office (E5-S6): my avatar and name, then the controls other
 * features add (microphone and camera from `media`; status and "Personas" from `presence`; reactions and chat
 * from `chat`). A plain group of buttons, Tab moves between them.
 */
export function SpaceBottomBar({ space, avatar, extensions }: SpaceBottomBarProps) {
  const { t } = useTranslation('world');
  return (
    <div
      role="group"
      aria-label={t('bottomBar.label')}
      className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/85 px-3 py-2 text-white shadow-lg"
    >
      <div className="flex items-center gap-2 pr-1">
        {avatar !== undefined && <AvatarSprite avatar={avatar} scale={1} walking={false} />}
        <span className="max-w-40 truncate text-sm font-medium">{space.displayName}</span>
      </div>
      {extensions.map(({ id, BarItems }) =>
        BarItems === undefined ? null : <BarItems key={id} space={space} />,
      )}
    </div>
  );
}
