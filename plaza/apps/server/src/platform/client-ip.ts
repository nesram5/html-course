import type { IncomingMessage } from 'node:http';

/**
 * Client IP of a raw Node request, trusting `hops` reverse proxies like Fastify's `trustProxy`
 * (proxy-addr with a hop count): the addresses are the TCP peer followed by `X-Forwarded-For`
 * from right to left, and the client is the one `hops` positions in (or the leftmost when the
 * header is shorter). With `false` the header is ignored, so a client cannot choose its IP.
 *
 * Used where Fastify's `request.ip` is not available: the WebSocket upgrade of Socket.IO.
 */
export function clientIp(request: IncomingMessage, hops: number | false): string {
  const peer = request.socket.remoteAddress ?? 'unknown';
  if (hops === false || hops <= 0) return peer;
  const header = request.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const chain = [peer, ...forwarded.reverse()];
  return chain[Math.min(hops, chain.length - 1)] ?? peer;
}
