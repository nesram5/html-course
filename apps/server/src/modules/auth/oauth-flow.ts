import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AppError } from '../../platform/errors.js';
import { pkceChallenge, randomToken, safeEqual } from './tokens.js';

/** Lifetime of a pending OAuth flow (time to go through Google's consent screen). */
const FLOW_TTL_SECONDS = 10 * 60;
/** OAuth callbacks live under this path, so flow cookies are only sent there. */
const FLOW_COOKIE_PATH = '/api/auth';

const FlowSecretsSchema = z.object({ state: z.string().min(1), verifier: z.string().min(1) });
export type FlowSecrets = z.infer<typeof FlowSecretsSchema>;

/**
 * Keeps the `state` and PKCE verifier of a pending OAuth flow (plus flow data such as `next`) in
 * a short-lived, signed, `HttpOnly` cookie. `SameSite=Lax` lets Google's top-level redirect back
 * carry it; nothing is stored server-side.
 */
export class OAuthFlowCookie<S extends z.ZodObject> {
  constructor(
    readonly name: string,
    private readonly dataSchema: S,
  ) {}

  /** Starts a flow: stores the cookie and returns the `state` and PKCE challenge to send. */
  begin(reply: FastifyReply, data: z.input<S>): { state: string; codeChallenge: string } {
    const state = randomToken();
    const verifier = randomToken();
    const value = Buffer.from(JSON.stringify({ ...data, state, verifier })).toString('base64url');
    reply.setCookie(this.name, value, {
      path: FLOW_COOKIE_PATH,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      signed: true,
      maxAge: FLOW_TTL_SECONDS,
    });
    return { state, codeChallenge: pkceChallenge(verifier) };
  }

  /** Reads (and clears) the pending flow without checking `state`; `null` if missing/tampered. */
  take(request: FastifyRequest, reply: FastifyReply): (z.output<S> & FlowSecrets) | null {
    const raw = request.cookies[this.name];
    reply.clearCookie(this.name, { path: FLOW_COOKIE_PATH });
    if (raw === undefined) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid) return null;
    try {
      const json: unknown = JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8'));
      const secrets = FlowSecretsSchema.safeParse(json);
      const data = this.dataSchema.safeParse(json);
      return secrets.success && data.success ? { ...data.data, ...secrets.data } : null;
    } catch {
      return null;
    }
  }

  /**
   * Checks the `state` Google sent back against the pending flow.
   * Throws `OAUTH_FAILED` (401) when the flow is missing, expired or the state differs.
   */
  static verify<F extends FlowSecrets>(flow: F | null, receivedState: string | undefined): F {
    if (flow === null) throw new AppError('OAUTH_FAILED', 'No pending OAuth flow');
    if (receivedState === undefined || !safeEqual(flow.state, receivedState)) {
      throw new AppError('OAUTH_FAILED', 'OAuth state mismatch');
    }
    return flow;
  }
}
