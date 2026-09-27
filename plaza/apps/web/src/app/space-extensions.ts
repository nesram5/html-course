import { mediaSpaceExtension } from '@/features/media';
import type { SpaceExtension } from '@/features/world';

/**
 * Features that add UI to the office page (`/s/:slug`), in order: their gates run one after the
 * other before entering, their overlays and bottom-bar controls are drawn in this order.
 */
export const spaceExtensions: readonly SpaceExtension[] = [mediaSpaceExtension];
