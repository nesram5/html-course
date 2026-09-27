import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/** What the office page tells the features that extend it. */
export interface SpaceInfo {
  readonly spaceId: string;
  readonly spaceName: string;
  /** The local person. */
  readonly userId: string;
  readonly displayName: string;
  /** Meeting room names by area id of the office map ("En Sala X"). */
  readonly roomNames: Readonly<Record<string, string>>;
}

export interface SpaceGateProps {
  readonly space: SpaceInfo;
  /** The person is ready: show the next gate, or enter the office. */
  readonly onDone: () => void;
}

export interface SpaceSlotProps {
  readonly space: SpaceInfo;
}

/**
 * A feature that adds UI to the office page (`/s/:slug`) without the `world` feature importing
 * it (features only depend on `world`, never the other way round). `app/` lists the extensions
 * and hands them to {@link SpaceExtensionsProvider}.
 */
export interface SpaceExtension {
  readonly id: string;
  /**
   * Shown over the office before entering it (e.g. the media pre-join, E5-S4). The map loads
   * behind it, but the person joins the space in real time only once every gate is done.
   */
  readonly Gate?: ComponentType<SpaceGateProps>;
  /** Drawn over the map once inside (e.g. the hallway video strip, E5-S6). */
  readonly Overlay?: ComponentType<SpaceSlotProps>;
  /** Controls added to the bottom bar, after the avatar and the name (e.g. mic and camera). */
  readonly BarItems?: ComponentType<SpaceSlotProps>;
  /**
   * Side panels (e.g. "Personas", chat), drawn after the bottom bar and the map controls so the
   * keyboard reaches them last. Only one is open at a time: see {@link sidePanelStore}.
   */
  readonly Panel?: ComponentType<SpaceSlotProps>;
}

const SpaceExtensionsContext = createContext<readonly SpaceExtension[]>([]);

export function SpaceExtensionsProvider({
  extensions,
  children,
}: {
  readonly extensions: readonly SpaceExtension[];
  readonly children: ReactNode;
}) {
  return <SpaceExtensionsContext value={extensions}>{children}</SpaceExtensionsContext>;
}

/** The extensions of the office page, in order. */
export function useSpaceExtensions(): readonly SpaceExtension[] {
  return useContext(SpaceExtensionsContext);
}
