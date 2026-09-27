import { realtimeClient, sessionStore, worldEvents } from '@/features/world';

import { fetchMediaToken } from '../api/media-api';
import { mediaStore } from '../store/media-store';
import { MediaController } from './media-controller';

/** The app-wide media controller (one LiveKit connection per tab). */
export const mediaController = new MediaController({
  realtime: realtimeClient,
  events: worldEvents,
  store: mediaStore,
  fetchToken: fetchMediaToken,
  realtimeJoined: () =>
    realtimeClient.connected && sessionStore.getState().session.kind === 'joined',
});
