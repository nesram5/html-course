/**
 * Thrown by the world functions whose implementation belongs to a later story.
 * Remove the stub (and this class, once unused) when implementing the story.
 */
export class NotImplementedError extends Error {
  constructor(feature: string, story: string) {
    super(`not implemented: ${feature} (${story})`);
    this.name = 'NotImplementedError';
  }
}
