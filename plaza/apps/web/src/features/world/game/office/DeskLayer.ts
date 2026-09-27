import * as Phaser from 'phaser';

import { ABOVE_DEPTH } from '../sprites/depth';
import type { DeskDrawing } from './desk-drawings';

/** Desk objects lie on the furniture: over the `below` art and rooms, under every avatar. */
export const DESK_DECOR_DEPTH = 20;
/** Desk name labels: over trees and roofs (like avatar names), under the avatar names. */
export const DESK_LABEL_DEPTH = ABOVE_DEPTH + 0.5;

/** Texture key of a decoration object of the catalog. */
export function decorTextureKey(itemId: string): string {
  return `decor:${itemId}`;
}

interface DrawnSlot {
  readonly itemId: string;
  /** `null` while the sprite loads (or when it failed). */
  image: Phaser.GameObjects.Image | null;
  /** Stops waiting for the sprite. */
  cancel: () => void;
}

interface DrawnDesk {
  readonly label: Phaser.GameObjects.Text;
  readonly slots: DrawnSlot[];
}

/** A drawn desk as seen by the development probe (E2E tests). */
export interface DeskProbe {
  readonly deskId: string;
  readonly label: string;
  /** Item id of each drawn object, by slot order (only loaded ones). */
  readonly items: readonly string[];
}

/**
 * Draws the held desks of the office (E9-S2, E9-S3): the owner's name over each desk and its
 * decoration objects in the fixed slots. `sync` diffs the {@link DeskDrawing}s against what is
 * on screen, so a `desk:updated` only touches that desk. Decoration sprites are loaded on
 * demand, once each; they are neutral and fit every style, so style changes leave them alone.
 */
export class DeskLayer {
  readonly #drawn = new Map<string, DrawnDesk>();
  readonly #waiting = new Map<string, Set<() => void>>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly decorUrlOf: (itemId: string) => string,
  ) {}

  sync(drawings: readonly DeskDrawing[]): void {
    const seen = new Set<string>();
    for (const drawing of drawings) {
      seen.add(drawing.deskId);
      const drawn = this.#drawn.get(drawing.deskId) ?? this.#create(drawing);
      if (drawn.label.text !== drawing.label) drawn.label.setText(drawing.label);
      drawn.label.setPosition(drawing.labelX, drawing.labelY);
      this.#syncItems(drawn, drawing);
    }
    for (const [deskId, drawn] of this.#drawn) {
      if (!seen.has(deskId)) {
        this.#destroyDesk(drawn);
        this.#drawn.delete(deskId);
      }
    }
  }

  probe(): DeskProbe[] {
    return [...this.#drawn].map(([deskId, drawn]) => ({
      deskId,
      label: drawn.label.text,
      items: drawn.slots.filter((slot) => slot.image !== null).map((slot) => slot.itemId),
    }));
  }

  destroy(): void {
    for (const drawn of this.#drawn.values()) this.#destroyDesk(drawn);
    this.#drawn.clear();
    this.#waiting.clear();
  }

  #create(drawing: DeskDrawing): DrawnDesk {
    const label = this.scene.add
      .text(drawing.labelX, drawing.labelY, drawing.label, {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DESK_LABEL_DEPTH);
    label.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const drawn: DrawnDesk = { label, slots: [] };
    this.#drawn.set(drawing.deskId, drawn);
    return drawn;
  }

  #syncItems(drawn: DrawnDesk, drawing: DeskDrawing): void {
    const same =
      drawn.slots.length === drawing.items.length &&
      drawn.slots.every((slot, i) => slot.itemId === drawing.items[i]?.itemId);
    if (same) return;
    for (const slot of drawn.slots) {
      slot.cancel();
      slot.image?.destroy();
    }
    drawn.slots.length = 0;
    for (const item of drawing.items) {
      const slot: DrawnSlot = { itemId: item.itemId, image: null, cancel: () => undefined };
      drawn.slots.push(slot);
      slot.cancel = this.#request(item.itemId, (key) => {
        slot.image = this.scene.add
          .image(item.x, item.y, key)
          .setOrigin(0.5, 0.75)
          .setDepth(DESK_DECOR_DEPTH);
      });
    }
  }

  #destroyDesk(drawn: DrawnDesk): void {
    drawn.label.destroy();
    for (const slot of drawn.slots) {
      slot.cancel();
      slot.image?.destroy();
    }
  }

  /** Calls `ready` with the texture key once the sprite is loaded; a failed sprite is skipped. */
  #request(itemId: string, ready: (key: string) => void): () => void {
    const key = decorTextureKey(itemId);
    if (this.scene.textures.exists(key)) {
      ready(key);
      return () => undefined;
    }
    let waiting = this.#waiting.get(key);
    if (waiting === undefined) {
      waiting = new Set();
      this.#waiting.set(key, waiting);
      this.#load(key, itemId);
    }
    const callback = () => {
      ready(key);
    };
    waiting.add(callback);
    const set = waiting;
    return () => {
      set.delete(callback);
    };
  }

  #load(key: string, itemId: string): void {
    const { load } = this.scene;
    const completeEvent = `${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${key}`;
    const settle = (loaded: boolean) => {
      const waiting = this.#waiting.get(key);
      this.#waiting.delete(key);
      load.off(completeEvent, onComplete);
      load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      if (loaded) for (const ready of waiting ?? []) ready();
    };
    const onComplete = () => {
      settle(true);
    };
    const onError = (file: Phaser.Loader.File) => {
      if (file.key === key) settle(false);
    };
    load.on(completeEvent, onComplete);
    load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    load.image(key, this.decorUrlOf(itemId));
    if (!load.isLoading()) load.start();
  }
}
