const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * When a chat message was sent: "10:15" today, `yesterday("10:15")` ("ayer 10:15", translated by
 * the caller) yesterday and "3 sept 10:15" before, so yesterday's messages do not look like
 * today's.
 */
export function messageTime(
  sentAt: Date,
  yesterday: (time: string) => string,
  now: Date = new Date(),
): string {
  const time = TIME.format(sentAt);
  if (sameDay(sentAt, now)) return time;
  const dayBefore = new Date(now);
  dayBefore.setDate(now.getDate() - 1);
  if (sameDay(sentAt, dayBefore)) return yesterday(time);
  return `${DAY.format(sentAt)} ${time}`;
}
