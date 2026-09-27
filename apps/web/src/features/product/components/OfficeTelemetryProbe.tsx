import { useEffect } from 'react';

import { mediaStore } from '@/features/media';
import { realtimeClient, sessionStore, type SpaceSlotProps } from '@/features/world';

import { OfficeTelemetry } from '../lib/office-telemetry';
import { telemetry } from '../lib/telemetry';

/**
 * Office overlay that draws nothing: measures the visit for the O3, O4 and O5 metrics
 * ({@link OfficeTelemetry}) and sends the samples before the page goes away.
 */
export function OfficeTelemetryProbe({ space }: SpaceSlotProps) {
  const { spaceId } = space;
  useEffect(() => {
    const probe = new OfficeTelemetry({
      spaceId,
      session: sessionStore,
      connection: realtimeClient.store,
      media: mediaStore,
      record: (sample) => {
        telemetry.record(sample);
      },
    });
    probe.start();
    const onPageHide = () => {
      telemetry.flush(true);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      probe.stop();
      telemetry.flush();
    };
  }, [spaceId]);
  return null;
}
