import { TILE_SIZE, type WorldMap } from '@plaza/shared';
import * as Phaser from 'phaser';

import type { WorldStore } from '../../store/world-store';
import { ROOM_DEPTH } from '../sprites/depth';
import { occupiedKey, roomOccupancy } from './room-occupancy';

/** Look of a meeting room: free (soft white) or occupied (amber tint, E6-S4). */
export const ROOM_STYLE = {
  free: { fill: 0xffffff, fillAlpha: 0.06, line: 0xffffff, lineAlpha: 0.55 },
  occupied: { fill: 0xf59e0b, fillAlpha: 0.22, line: 0xfbbf24, lineAlpha: 0.95 },
} as const;

/** A drawn room as seen by the debug probe. */
export interface RoomProbe {
  readonly areaId: string;
  readonly occupied: boolean;
  readonly people: number;
}

/**
 * Meeting rooms on the floor (E3-S2, E6-S4): a border and the name; while someone is inside, the
 * room is tinted amber so people in the hallway can tell a meeting is going on. Occupancy comes
 * from the world store (the local player's room and everyone else's `roomId`), redrawn only when
 * the set of occupied rooms changes.
 */
export class RoomLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly names: Phaser.GameObjects.Text[] = [];
  private occupancy: ReadonlyMap<string, number> = new Map();
  private drawnKey: string | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly map: WorldMap,
    store: WorldStore,
  ) {
    this.graphics = scene.add.graphics().setDepth(ROOM_DEPTH);
    for (const room of map.rooms) {
      const x = room.x * TILE_SIZE;
      const y = room.y * TILE_SIZE;
      const w = room.width * TILE_SIZE;
      const h = room.height * TILE_SIZE;
      const name = scene.add
        .text(x + w / 2, y + h - 8, room.name, {
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.8)
        .setDepth(ROOM_DEPTH)
        .setShadow(0, 1, 'rgba(15, 23, 42, 0.6)', 2);
      name.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
      name.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.names.push(name);
    }
    const update = () => {
      const { players, localPlayer } = store.getState();
      this.occupancy = roomOccupancy(players.values(), localPlayer?.roomId ?? null);
      this.draw();
    };
    update();
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.players !== previous.players || state.localPlayer !== previous.localPlayer) {
        update();
      }
    });
  }

  probe(): RoomProbe[] {
    return this.map.rooms.map((room) => {
      const people = this.occupancy.get(room.areaId) ?? 0;
      return { areaId: room.areaId, occupied: people > 0, people };
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.graphics.destroy();
    for (const name of this.names.splice(0)) name.destroy();
  }

  private draw(): void {
    const key = occupiedKey(this.occupancy);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.graphics.clear();
    for (const room of this.map.rooms) {
      const style = this.occupancy.has(room.areaId) ? ROOM_STYLE.occupied : ROOM_STYLE.free;
      const x = room.x * TILE_SIZE;
      const y = room.y * TILE_SIZE;
      const w = room.width * TILE_SIZE;
      const h = room.height * TILE_SIZE;
      this.graphics.fillStyle(style.fill, style.fillAlpha).fillRect(x, y, w, h);
      this.graphics
        .lineStyle(2, style.line, style.lineAlpha)
        .strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
}
