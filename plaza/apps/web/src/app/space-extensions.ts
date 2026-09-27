import { chatSpaceExtension } from '@/features/chat';
import { mediaSpaceExtension } from '@/features/media';
import { personalizationSpaceExtension } from '@/features/personalization';
import { presenceSpaceExtension } from '@/features/presence';
import { productSpaceExtension } from '@/features/product';
import { roomsSpaceExtension } from '@/features/rooms';
import type { SpaceExtension } from '@/features/world';

import { errorContextSpaceExtension } from './error-context-extension';

/**
 * Features that add UI to the office page (`/s/:slug`), in order: their gates run one after the
 * other before entering, their overlays, bottom-bar controls and side panels are drawn in this
 * order (bar: name · microphone · camera · status · "Personas" · reactions · chat · "Mi escritorio").
 * `product` only measures the visit (E8-S7) and draws nothing.
 */
export const spaceExtensions: readonly SpaceExtension[] = [
  mediaSpaceExtension,
  // After media: its room signal reaches a media controller that is already running.
  roomsSpaceExtension,
  presenceSpaceExtension,
  chatSpaceExtension,
  personalizationSpaceExtension,
  productSpaceExtension,
  errorContextSpaceExtension,
];
