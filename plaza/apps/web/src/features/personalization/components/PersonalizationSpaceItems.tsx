import type { SpaceSlotProps } from '@/features/world';

import { DeskHud } from './DeskHud';
import { MyDeskButton } from './MyDeskButton';

/** Desks over the office map (E9-S2, E9-S3): the `X` hint and menu, and "Decorar". */
export function DeskOverlay({ space }: SpaceSlotProps) {
  return <DeskHud spaceId={space.spaceId} map={space.map} selfUserId={space.userId} />;
}

/** "Mi escritorio" in the office bottom bar (E9-S2). */
export function MyDeskBarItem({ space }: SpaceSlotProps) {
  return <MyDeskButton selfUserId={space.userId} />;
}
