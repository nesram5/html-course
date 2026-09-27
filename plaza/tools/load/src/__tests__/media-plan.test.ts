import { describe, expect, it } from 'vitest';

import {
  mbps,
  monthlyTerabytes,
  parseDockerCpu,
  planConversations,
  stat,
  sumPrometheus,
} from '../media-plan.js';

describe('planConversations', () => {
  it('puts everyone in one conversation with the others of their group only', () => {
    const plan = planConversations(12, 4, 'r1');

    expect(plan).toHaveLength(48);
    expect(new Set(plan.map((p) => p.identity)).size).toBe(48);
    for (const person of plan) {
      expect(person.peers).toHaveLength(3);
      expect(person.peers).not.toContain(person.identity);
      for (const peer of person.peers) {
        expect(plan.find((p) => p.identity === peer)?.group).toBe(person.group);
      }
    }
  });
});

describe('LiveKit figures', () => {
  it('reads the docker stats CPU as percent of one core', () => {
    expect(parseDockerCpu('183.25%\n')).toBe(183.25);
    expect(parseDockerCpu('--')).toBeNull();
  });

  it('sums Prometheus counters by label', () => {
    const text = [
      '# HELP livekit_packet_bytes bytes',
      'livekit_packet_bytes{direction="incoming",type="video"} 1000',
      'livekit_packet_bytes{direction="incoming",type="audio"} 24',
      'livekit_packet_bytes{direction="outgoing",type="video"} 3e3',
      'livekit_packet_total{direction="incoming"} 99',
    ].join('\n');

    expect(
      sumPrometheus(text, 'livekit_packet_bytes', { name: 'direction', value: 'incoming' }),
    ).toBe(1024);
    expect(
      sumPrometheus(text, 'livekit_packet_bytes', { name: 'direction', value: 'outgoing' }),
    ).toBe(3000);
    expect(sumPrometheus(text, 'livekit_packet_bytes')).toBe(4024);
    expect(sumPrometheus(text, 'missing_metric')).toBeNull();
  });

  it('turns byte deltas into Mbps and a monthly volume', () => {
    expect(mbps(1_250_000, 10)).toBe(1);
    expect(mbps(100, 0)).toBe(0);
    // 100 Mbps for 8 h a day, 22 days: 100e6 × 3600 × 8 × 22 / 8 bytes = 7.92 TB.
    expect(monthlyTerabytes(100, 8, 22)).toBeCloseTo(7.92, 5);
    expect(stat([1, 3])).toEqual({ avg: 2, max: 3 });
    expect(stat([])).toBeNull();
  });
});
