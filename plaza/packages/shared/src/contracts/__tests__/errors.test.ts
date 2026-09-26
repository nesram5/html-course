import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ERROR_HTTP_STATUS, ErrorResponseSchema, isErrorCode } from '../errors.js';

describe('error codes', () => {
  it('has a unique list with an HTTP status for every code', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('includes the codes required by the architecture and stories', () => {
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION_ERROR',
      'NOT_A_MEMBER',
      'SPACE_FULL',
      'PROTOCOL_MISMATCH',
      'SESSION_REPLACED',
      'RATE_LIMITED',
      'UNKNOWN_MAP_TEMPLATE',
      'INVALID_INVITE',
      'INTERNAL',
    ]) {
      expect(isErrorCode(code)).toBe(true);
    }
    expect(isErrorCode('NOPE')).toBe(false);
  });

  it('validates the REST error body', () => {
    expect(
      ErrorResponseSchema.safeParse({ error: { code: 'INTERNAL', message: 'boom' } }).success,
    ).toBe(true);
    expect(ErrorResponseSchema.safeParse({ error: { code: 'BOOM', message: 'x' } }).success).toBe(
      false,
    );
  });
});
