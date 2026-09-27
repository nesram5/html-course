import { PROXIMITY_HYSTERESIS, PROXIMITY_RADIUS } from '@plaza/shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEDIA_CHOICES,
  hallwayNoticeSeen,
  loadMediaChoices,
  markHallwayNoticeSeen,
  saveMediaChoices,
  type PrefsStorage,
} from '../lib/media-prefs';
import { VIDEO_MIN_OPACITY, tileDistance, videoOpacity } from '../lib/video-opacity';

function memoryStorage(): PrefsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwing: PrefsStorage = {
  getItem: () => {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('full', 'QuotaExceededError');
  },
};

describe('media preferences (E5-S4)', () => {
  it('remembers the chosen devices for the next visit', () => {
    const storage = memoryStorage();
    const choices = {
      audioEnabled: false,
      videoEnabled: true,
      audioDeviceId: 'mic-2',
      videoDeviceId: 'cam-1',
      audioOutputDeviceId: null,
    };

    saveMediaChoices(choices, storage);

    expect(loadMediaChoices(storage)).toEqual(choices);
  });

  it('falls back to the defaults when nothing, garbage or an old format is stored', () => {
    const storage = memoryStorage();
    expect(loadMediaChoices(storage)).toEqual(DEFAULT_MEDIA_CHOICES);
    storage.data.set('plaza.media.choices.v1', '{not json');
    expect(loadMediaChoices(storage)).toEqual(DEFAULT_MEDIA_CHOICES);
    storage.data.set('plaza.media.choices.v1', JSON.stringify({ audioEnabled: 'yes' }));
    expect(loadMediaChoices(storage)).toEqual(DEFAULT_MEDIA_CHOICES);
  });

  it('works without storage (blocked or full): nothing is remembered, nothing breaks', () => {
    expect(() => {
      saveMediaChoices(DEFAULT_MEDIA_CHOICES, throwing);
    }).not.toThrow();
    expect(loadMediaChoices(throwing)).toEqual(DEFAULT_MEDIA_CHOICES);
    expect(loadMediaChoices(null)).toEqual(DEFAULT_MEDIA_CHOICES);
    expect(hallwayNoticeSeen(throwing)).toBe(false);
    expect(() => {
      markHallwayNoticeSeen(throwing);
    }).not.toThrow();
  });

  it('remembers that the hallway notice was seen', () => {
    const storage = memoryStorage();
    expect(hallwayNoticeSeen(storage)).toBe(false);
    markHallwayNoticeSeen(storage);
    expect(hallwayNoticeSeen(storage)).toBe(true);
  });
});

describe('video opacity by distance (E5-S6)', () => {
  it('is opaque close by and fades to the minimum at radius + hysteresis', () => {
    expect([PROXIMITY_RADIUS, PROXIMITY_HYSTERESIS]).toEqual([3, 1]);
    expect(videoOpacity(0)).toBe(1);
    expect(videoOpacity(2)).toBe(1);
    expect(videoOpacity(3)).toBeCloseTo(1 - (1 - VIDEO_MIN_OPACITY) / 2);
    expect(videoOpacity(4)).toBe(VIDEO_MIN_OPACITY);
    expect(videoOpacity(9)).toBe(VIDEO_MIN_OPACITY);
  });

  it('decreases monotonically with the distance', () => {
    let previous = 1;
    for (let d = 0; d <= 5; d += 0.25) {
      const opacity = videoOpacity(d);
      expect(opacity).toBeLessThanOrEqual(previous);
      previous = opacity;
    }
  });

  it('measures distances like the proximity engine (euclidean tiles)', () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
