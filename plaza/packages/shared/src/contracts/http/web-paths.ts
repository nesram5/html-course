/**
 * Paths of the web app that the server also needs (redirects after OAuth, invite links).
 * Build URLs with `apiPath()`, which fills any path template.
 */
export const WEB_PATHS = {
  login: '/login',
  profile: '/profile',
  /** "My spaces": default destination after signing in. */
  spaces: '/spaces',
  newSpace: '/spaces/new',
  /** Owner settings: invite link, allowed domain, members and Meet rooms. */
  spaceSettings: '/spaces/:spaceId/settings',
  join: '/join/:token',
  /** The office itself (world feature). */
  space: '/s/:slug',
} as const;
