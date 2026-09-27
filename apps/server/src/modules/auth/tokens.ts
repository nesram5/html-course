import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url: session tokens, OAuth `state` and PKCE verifiers. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 (hex) of a token: what the database stores instead of the token (§11.1). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** PKCE S256 code challenge of a verifier (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
