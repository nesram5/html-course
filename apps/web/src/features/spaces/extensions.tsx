import type { MemberDto } from '@bululu/shared';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/** What the space settings tell the feature that draws a member's desk cell. */
export interface MemberDeskCellProps {
  readonly spaceId: string;
  /** `/s/<slug>` of the space, for "Ir a su escritorio". */
  readonly spacePath: string;
  /** Tiled map of the space template (desk ids), `undefined` while loading. */
  readonly mapUrl: string | undefined;
  readonly member: MemberDto;
  /** Desks held by someone in the space. */
  readonly takenDeskIds: ReadonlySet<string>;
  /** A desk was assigned or freed: refresh the members list. */
  readonly onChanged: () => void;
}

/**
 * UI that other features add to the space settings without `spaces` importing them (features
 * that depend on `spaces`, like `personalization` through `world`, would otherwise form an
 * import cycle). `app/` provides them.
 */
export interface SpaceSettingsExtensions {
  /** "Escritorio" column of "Miembros" (E9-S2); the column is hidden without it. */
  readonly MemberDeskCell?: ComponentType<MemberDeskCellProps>;
}

const SpaceSettingsExtensionsContext = createContext<SpaceSettingsExtensions>({});

export function SpaceSettingsExtensionsProvider({
  extensions,
  children,
}: {
  readonly extensions: SpaceSettingsExtensions;
  readonly children: ReactNode;
}) {
  return (
    <SpaceSettingsExtensionsContext value={extensions}>{children}</SpaceSettingsExtensionsContext>
  );
}

export function useSpaceSettingsExtensions(): SpaceSettingsExtensions {
  return useContext(SpaceSettingsExtensionsContext);
}
