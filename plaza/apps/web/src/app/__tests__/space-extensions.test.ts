import { describe, expect, it } from 'vitest';

import { mediaSpaceExtension } from '@/features/media';

import { spaceExtensions } from '../space-extensions';

describe('office page extensions', () => {
  it('include the hallway media: pre-join gate, video strip and bar controls (E5)', () => {
    expect(spaceExtensions).toContain(mediaSpaceExtension);
    expect(mediaSpaceExtension.Gate).toBeDefined();
    expect(mediaSpaceExtension.Overlay).toBeDefined();
    expect(mediaSpaceExtension.BarItems).toBeDefined();
  });
});
