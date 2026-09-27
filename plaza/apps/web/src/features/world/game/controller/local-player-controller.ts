import { isWalkable, stepTowards, type Direction, type Tile, type WorldMap } from '@plaza/shared';

import type { LocalStep } from '../../bridge/event-bus';
import { STEP_MS } from '../constants';

export interface LocalPlayerControllerOptions {
  readonly map: WorldMap;
  readonly start: Tile;
  readonly dir?: Direction;
  readonly stepMs?: number;
  /** Called when a step starts (new tile) or when the avatar turns in place (same tile). */
  readonly onStep: (step: LocalStep) => void;
}

/** Snapshot of the controller, read every frame by the scene to draw the avatar. */
export interface LocalPlayerSnapshot {
  /** Logical tile (the destination while a step is in progress). */
  readonly tile: Tile;
  readonly dir: Direction;
  readonly moving: boolean;
  /** Drawn position in tiles, interpolated during a step. */
  readonly position: { readonly x: number; readonly y: number };
}

/**
 * Tile-by-tile movement of the local avatar (E3-S3, E3-S4), framework-free so it can be unit
 * tested: a held direction walks one tile every `stepMs`, continuously while held; a blocked
 * tile (`isWalkable`, the same function the server uses) only turns the avatar. A quick tap
 * between two frames still moves one tile.
 */
export class LocalPlayerController {
  private readonly map: WorldMap;
  private readonly stepMs: number;
  private readonly onStep: (step: LocalStep) => void;
  /** Held directions, most recent last: the last one wins. */
  private readonly held: Direction[] = [];
  /** A direction pressed since the last update, honoured even if already released. */
  private tapped: Direction | null = null;
  private tile: Tile;
  private from: Tile;
  private dir: Direction;
  private moving = false;
  private elapsed = 0;

  constructor(options: LocalPlayerControllerOptions) {
    this.map = options.map;
    this.stepMs = options.stepMs ?? STEP_MS;
    this.onStep = options.onStep;
    this.tile = options.start;
    this.from = options.start;
    this.dir = options.dir ?? 'down';
  }

  press(dir: Direction): void {
    this.release(dir);
    this.held.push(dir);
    this.tapped = dir;
  }

  release(dir: Direction): void {
    const index = this.held.indexOf(dir);
    if (index !== -1) this.held.splice(index, 1);
  }

  /** Forget every held key (focus moved to a text field, window lost focus). */
  releaseAll(): void {
    this.held.length = 0;
    this.tapped = null;
  }

  /**
   * Places the avatar on a tile at once, for positions decided by the server: the spawn and
   * reconnections (`space:snapshot`), rejected steps (`player:correct`), "Mi escritorio".
   * Emits no step: the server already knows. A held key keeps walking from there.
   */
  teleport(tile: Tile, dir: Direction = this.dir): void {
    this.tile = { x: tile.x, y: tile.y };
    this.from = this.tile;
    this.dir = dir;
    this.moving = false;
    this.elapsed = 0;
  }

  /** Advances the simulation by `deltaMs` (Phaser's `update(time, delta)`). */
  update(deltaMs: number): void {
    let remaining = Math.max(0, deltaMs);
    for (;;) {
      if (this.moving) {
        this.elapsed += remaining;
        if (this.elapsed < this.stepMs) return;
        remaining = this.elapsed - this.stepMs;
        this.moving = false;
        this.elapsed = 0;
        this.from = this.tile;
      }
      const wanted = this.held.at(-1) ?? this.tapped;
      this.tapped = null;
      if (wanted === null) return;
      if (!this.startStep(wanted)) return;
    }
  }

  /** Starts a step towards `dir`; returns `false` when blocked (the avatar only turns). */
  private startStep(dir: Direction): boolean {
    const turned = dir !== this.dir;
    this.dir = dir;
    const target = stepTowards(this.tile, dir);
    if (!isWalkable(this.map, target.x, target.y)) {
      if (turned) this.onStep({ x: this.tile.x, y: this.tile.y, dir });
      return false;
    }
    this.from = this.tile;
    this.tile = target;
    this.moving = true;
    this.elapsed = 0;
    this.onStep({ x: target.x, y: target.y, dir });
    return true;
  }

  get snapshot(): LocalPlayerSnapshot {
    const t = this.moving ? Math.min(1, this.elapsed / this.stepMs) : 1;
    return {
      tile: this.tile,
      dir: this.dir,
      moving: this.moving,
      position: {
        x: this.from.x + (this.tile.x - this.from.x) * t,
        y: this.from.y + (this.tile.y - this.from.y) * t,
      },
    };
  }
}
