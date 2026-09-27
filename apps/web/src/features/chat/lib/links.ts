/** A piece of a chat message: plain text or a web link. */
export type MessagePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

/** `http(s)://…` or `www.…` up to the next whitespace. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu;
/** Punctuation that usually ends a sentence rather than the link ("mira https://x.com."). */
const TRAILING = /[.,;:!?)\]}'»]+$/u;

function safeHref(raw: string): string | null {
  const candidate = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Splits a chat message into text and links (E7-S3). Only `http(s)` links are recognised, so
 * `javascript:` and other schemes stay plain text. The text is never parsed as HTML: React
 * escapes every part when rendering.
 */
export function splitLinks(body: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index;
    const trailing = TRAILING.exec(match[0])?.[0] ?? '';
    const text = match[0].slice(0, match[0].length - trailing.length);
    const href = safeHref(text);
    if (href === null) continue;
    if (start > last) parts.push({ kind: 'text', text: body.slice(last, start) });
    parts.push({ kind: 'link', text, href });
    last = start + text.length;
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}
