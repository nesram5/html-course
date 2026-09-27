import { z } from 'zod';

import { SafeNextPathSchema } from './common.js';
import { DisplayNameSchema, MeSchema } from './me.js';

/** `GET /api/auth/google?next=/s/acme` → 302 to Google (PKCE + `state`). */
export const AuthStartQuerySchema = z.object({
  next: SafeNextPathSchema.optional(),
});
export type AuthStartQuery = z.infer<typeof AuthStartQuerySchema>;

/**
 * `GET /api/auth/google/callback` (and `/api/auth/google/meet/callback`).
 * Google sends either `code` + `state` or `error` (e.g. `access_denied` when the person cancels).
 */
export const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});
export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

/**
 * Query appended by the server to the web login page when sign-in did not complete
 * (`/login?error=cancelled&next=...`), so the page can show "No se completó el inicio de sesión".
 */
export const LoginErrorReasonSchema = z.enum(['cancelled', 'failed']);
export type LoginErrorReason = z.infer<typeof LoginErrorReasonSchema>;

/**
 * `POST /api/auth/test-login` — only registered when `AUTH_TEST_LOGIN=true` (CI and local).
 * Creates (or reuses) the user identified by `googleSub` (defaults to the email) and a session.
 */
export const TestLoginBodySchema = z.object({
  email: z.email(),
  displayName: DisplayNameSchema.optional(),
  googleSub: z.string().min(1).max(255).optional(),
  /** Simulates a Google Workspace account (`hd` claim) for `allowedDomain` tests. */
  hostedDomain: z.string().min(1).optional(),
});
export type TestLoginBody = z.infer<typeof TestLoginBodySchema>;

export const TestLoginResponseSchema = z.object({ user: MeSchema });
export type TestLoginResponse = z.infer<typeof TestLoginResponseSchema>;

// `POST /api/auth/logout` → 204, clears the cookie and deletes the session.
