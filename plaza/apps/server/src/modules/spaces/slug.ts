/** Longest slug base; leaves room for a `-<n>` suffix within the 80 characters allowed. */
const SLUG_BASE_MAX_LEN = 60;
const FALLBACK_SLUG = 'espacio';

/** "Oficina Acme · Madrid" → "oficina-acme-madrid" (lowercase ASCII, digits and single dashes). */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX_LEN)
    .replace(/-+$/g, '');
  return slug === '' ? FALLBACK_SLUG : slug;
}

/** First of `base`, `base-2`, `base-3`… that is not in `taken`. */
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}
