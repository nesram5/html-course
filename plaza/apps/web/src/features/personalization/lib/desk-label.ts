import type { TFunction } from 'i18next';

/** "desk-03" → "Escritorio 3"; other ids are shown as they are (they come from Tiled). */
export function deskLabel(t: TFunction<'personalization'>, deskId: string): string {
  const match = /^desk-0*(\d+)$/.exec(deskId);
  return match === null ? deskId : t('desk.name', { n: Number(match[1]) });
}
