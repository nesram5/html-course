/**
 * Pure helpers of the hallway media load test (E8-S3, `media.ts`): who talks with whom, and
 * how the LiveKit figures (docker stats CPU, Prometheus byte counters) are read.
 */

export interface MediaParticipant {
  identity: string;
  group: number;
  /** Identities of the other people of the same conversation (the `media:peers` of Bululu). */
  peers: string[];
}

/** `groups` conversations of `size` people each: everyone subscribes to their group only. */
export function planConversations(groups: number, size: number, run: string): MediaParticipant[] {
  const identity = (group: number, member: number) =>
    `media-${run}-g${String(group + 1).padStart(2, '0')}-p${String(member + 1)}`;
  const participants: MediaParticipant[] = [];
  for (let group = 0; group < groups; group++) {
    for (let member = 0; member < size; member++) {
      const peers = [];
      for (let other = 0; other < size; other++) {
        if (other !== member) peers.push(identity(group, other));
      }
      participants.push({ identity: identity(group, member), group, peers });
    }
  }
  return participants;
}

/** `docker stats --format '{{.CPUPerc}}'` → percent of ONE core (e.g. `"183.2%"` → 183.2). */
export function parseDockerCpu(value: string): number | null {
  const match = /^\s*([\d.]+)%\s*$/.exec(value);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * Sum of the Prometheus samples of `metric` whose labels include `label="value"`
 * (e.g. `livekit_packet_bytes{direction="outgoing",…} 1.2e+06`). `null` if there is none.
 */
export function sumPrometheus(
  text: string,
  metric: string,
  label?: { name: string; value: string },
): number | null {
  let total: number | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    const match = /^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+(\S+)/.exec(line);
    if (match?.[1] !== metric) continue;
    if (label !== undefined && !(match[2] ?? '').includes(`${label.name}="${label.value}"`)) {
      continue;
    }
    const value = Number(match[3]);
    if (Number.isFinite(value)) total = (total ?? 0) + value;
  }
  return total;
}

/** Megabits per second from a byte counter delta. */
export function mbps(bytes: number, seconds: number): number {
  return seconds <= 0 ? 0 : (bytes * 8) / seconds / 1_000_000;
}

/**
 * Monthly media traffic (TB) of the VM for a sustained outgoing rate, with the hours of use per
 * working day and the working days per month of the beta.
 */
export function monthlyTerabytes(
  mbpsOut: number,
  hoursPerDay: number,
  daysPerMonth: number,
): number {
  return (mbpsOut * 1_000_000 * 3600 * hoursPerDay * daysPerMonth) / 8 / 1e12;
}

export interface Stat {
  avg: number;
  max: number;
}

export function stat(values: readonly number[]): Stat | null {
  if (values.length === 0) return null;
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    max: Math.max(...values),
  };
}
