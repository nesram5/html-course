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
  /** What Bululu stores and what it does not (E8-S6). Public. */
  privacy: '/privacidad',
  /** In-app feedback form (E8-S7). */
  feedback: '/comentarios',
  /** O1–O6 metrics for the people in `ADMIN_EMAILS` (E8-S7). */
  adminMetrics: '/admin/metricas',
} as const;
