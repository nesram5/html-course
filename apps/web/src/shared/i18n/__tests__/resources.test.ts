import { ERROR_CODES } from '@bululu/shared';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../i18n';
import { resources } from '../resources';

describe('i18n resources', () => {
  it('translates every shared error code', () => {
    const translated = Object.keys(resources.es.common.errors);

    const missing = ERROR_CODES.filter((code) => !translated.includes(code));

    expect(missing).toEqual([]);
  });

  it('registers one namespace per feature plus common and catalog', () => {
    expect(Object.keys(resources.es).sort()).toEqual([
      'auth',
      'catalog',
      'chat',
      'common',
      'media',
      'personalization',
      'presence',
      'product',
      'rooms',
      'spaces',
      'world',
    ]);
  });

  it('resolves Spanish texts synchronously', () => {
    const i18n = createI18n();

    expect(i18n.t('errors.SPACE_FULL')).toBe('El espacio está lleno (máximo 50 personas).');
  });
});
