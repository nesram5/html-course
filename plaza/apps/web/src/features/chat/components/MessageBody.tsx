import { splitLinks } from '../lib/links';

/**
 * Text of a chat message (E7-S3): rendered as React text (escaped, never HTML) with `http(s)`
 * links clickable in a new tab with `rel="noopener noreferrer"`.
 */
export function MessageBody({ body }: { readonly body: string }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {splitLinks(body).map((part, index) =>
        part.kind === 'link' ? (
          <a
            // The parts of a message never move: the index is a stable key.
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 underline hover:text-brand-600"
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}
