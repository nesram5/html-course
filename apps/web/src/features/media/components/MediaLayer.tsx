import { useEffect, useMemo } from 'react';

import type { SpaceSlotProps } from '@/features/world';

import type { MediaController } from '../controller/media-controller';
import { mediaController } from '../controller/media-instance';
import { installMediaDebug } from '../debug';
import { useMediaShortcuts } from '../hooks/useMediaShortcuts';
import { loadMediaChoices } from '../lib/media-prefs';
import { useMediaStore } from '../store/media-store';
import { HallwayNotice } from './HallwayNotice';
import { VideoStrip } from './VideoStrip';

export interface MediaLayerProps extends SpaceSlotProps {
  readonly controller?: MediaController;
}

/**
 * Hallway media inside the office (E5-S5, E5-S6): runs the `MediaController` while the office
 * is open (with the pre-join choices), and draws the video strip and the first-use notice.
 * Leaving the office stops the controller, which releases the camera and the microphone.
 */
export function MediaLayer({ space, controller = mediaController }: MediaLayerProps) {
  const { spaceId } = space;
  useEffect(() => {
    controller.start(spaceId, controller.store.getState().choices ?? loadMediaChoices());
    return () => {
      controller.stop();
    };
  }, [controller, spaceId]);
  useEffect(() => installMediaDebug(controller.store), [controller]);

  const shortcuts = useMemo(
    () => ({
      toggleMic: () => {
        void controller.toggleMic();
      },
      toggleCamera: () => {
        void controller.toggleCamera();
      },
    }),
    [controller],
  );
  useMediaShortcuts(shortcuts);
  const inRoom = useMediaStore((state) => state.roomMuted, controller.store);

  return (
    <>
      <VideoStrip controller={controller} />
      <HallwayNotice inRoom={inRoom} />
    </>
  );
}
