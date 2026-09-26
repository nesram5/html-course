import { authMessages } from '@/features/auth';
import { chatMessages } from '@/features/chat';
import { mediaMessages } from '@/features/media';
import { personalizationMessages } from '@/features/personalization';
import { presenceMessages } from '@/features/presence';
import { roomsMessages } from '@/features/rooms';
import { spacesMessages } from '@/features/spaces';
import { worldMessages } from '@/features/world';

import common from './es.json';

export const defaultNS = 'common';

/**
 * Spanish texts, one namespace per feature (`t('spaces:wizard.title')`) plus `common`.
 * Each feature owns its `i18n/es.json`, so features never edit the same file.
 */
export const resources = {
  es: {
    common,
    auth: authMessages.es,
    spaces: spacesMessages.es,
    world: worldMessages.es,
    media: mediaMessages.es,
    rooms: roomsMessages.es,
    presence: presenceMessages.es,
    chat: chatMessages.es,
    personalization: personalizationMessages.es,
  },
} as const;
