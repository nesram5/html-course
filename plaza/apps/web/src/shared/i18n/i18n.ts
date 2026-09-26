import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { defaultNS, resources } from './resources';

/** Creates an initialised i18next instance (Spanish only in the MVP). Synchronous. */
export function createI18n(): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: 'es',
    fallbackLng: 'es',
    resources,
    defaultNS,
    ns: Object.keys(resources.es),
    interpolation: { escapeValue: false }, // React already escapes
    initAsync: false,
  });
  return instance;
}
