import { TILE_SIZE, type DeskArea, type DeskState } from '@plaza/shared';

import type { DecorPreview } from '../../store/office-store';

/** One decoration object on a desk, in map pixels (E9-S3). */
export interface DeskItemDrawing {
  readonly slot: number;
  readonly itemId: string;
  readonly x: number;
  readonly y: number;
}

/** What the scene draws for a held desk: the owner's name over it and its objects (E9-S2). */
export interface DeskDrawing {
  readonly deskId: string;
  readonly label: string;
  /** Bottom-center of the name label, in map pixels. */
  readonly labelX: number;
  readonly labelY: number;
  readonly items: readonly DeskItemDrawing[];
}

/**
 * Held desks of the map as the scene draws them. The decoration being chosen in "Decorar"
 * (`preview`) replaces the saved one on its desk. Pure: the Phaser `DeskLayer` only diffs this.
 */
export function deskDrawings(
  areas: readonly DeskArea[],
  held: Readonly<Record<string, DeskState>>,
  preview: DecorPreview | null,
): DeskDrawing[] {
  const drawings: DeskDrawing[] = [];
  for (const area of areas) {
    const desk = held[area.deskId];
    if (desk === undefined || desk.userId === null) continue;
    const decor = preview?.deskId === area.deskId ? preview.decor : desk.decor;
    const items: DeskItemDrawing[] = [];
    decor?.slots.forEach((itemId, slot) => {
      const point = area.decorSlots[slot];
      if (itemId !== null && point !== undefined) items.push({ slot, itemId, ...point });
    });
    drawings.push({
      deskId: area.deskId,
      label: desk.displayName ?? '',
      labelX: area.x * TILE_SIZE + (area.width * TILE_SIZE) / 2,
      labelY: area.y * TILE_SIZE - 2,
      items,
    });
  }
  return drawings;
}

/** Pixel center of a desk, where "Ir a su escritorio" points the camera. */
export function deskCenter(area: DeskArea): { x: number; y: number } {
  return {
    x: area.x * TILE_SIZE + (area.width * TILE_SIZE) / 2,
    y: area.y * TILE_SIZE + (area.height * TILE_SIZE) / 2,
  };
}
