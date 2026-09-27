import { apiPath, WEB_PATHS } from '@plaza/shared';

/** Public `/join/<token>` URL of the web app. */
export function inviteUrl(publicUrl: string, token: string): string {
  return `${publicUrl}${apiPath(WEB_PATHS.join, { token })}`;
}
