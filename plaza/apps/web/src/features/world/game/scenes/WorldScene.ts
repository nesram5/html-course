import { TILE_SIZE, roomAt, type WorldMap } from '@plaza/shared';
import * as Phaser from 'phaser';

import type { ThemeAssets } from '../../api/assets';
import type { EventBus, LocalStep } from '../../bridge/event-bus';
import type { WorldStore } from '../../store/world-store';
import { recolorImage } from '../color-matrix';
import { CAMERA_LERP, STEP_MS } from '../constants';
import { KeyboardInput } from '../controller/keyboard-input';
import { LocalPlayerController, pickSpawn } from '../controller/local-player-controller';
import { ABOVE_DEPTH, AvatarSprite } from '../sprites/AvatarSprite';
import { SCENES, TEXTURES } from '../textures';

export interface WorldSceneDeps {
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
  readonly displayName: string;
  readonly events: EventBus;
  readonly store: WorldStore;
}

const ROOM_DEPTH = 10;

/**
 * The office (E3-S2..S5): draws the style images (`below` → avatars → `above`), the meeting
 * room borders and names, the local avatar with its keyboard controller, and a camera that
 * follows it inside the map bounds. Every listener it registers is removed on shutdown.
 */
export class WorldScene extends Phaser.Scene {
  private controller: LocalPlayerController | null = null;
  private avatar: AvatarSprite | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly deps: WorldSceneDeps) {
    super(SCENES.world);
  }

  create(): void {
    const { map, store, events } = this.deps;
    const width = map.width * TILE_SIZE;
    const height = map.height * TILE_SIZE;

    this.add.image(0, 0, this.styleTexture(TEXTURES.below)).setOrigin(0).setDepth(0);
    this.add.image(0, 0, this.styleTexture(TEXTURES.above)).setOrigin(0).setDepth(ABOVE_DEPTH);
    this.drawRooms();

    const start = pickSpawn(map);
    this.avatar = new AvatarSprite(
      this,
      TEXTURES.localAvatar,
      this.deps.displayName,
    ).setTilePosition(start.x, start.y);
    this.controller = new LocalPlayerController({
      map,
      start,
      stepMs: STEP_MS,
      onStep: (step) => {
        this.onLocalStep(step);
      },
    });
    store
      .getState()
      .setLocalPlayer({ ...start, dir: 'down', roomId: roomAt(map, start.x, start.y) });

    const camera = this.cameras.main;
    camera.setBounds(0, 0, width, height);
    camera.setRoundPixels(true);
    camera.setZoom(store.getState().zoom);
    camera.startFollow(this.avatar, true, CAMERA_LERP, CAMERA_LERP);

    const controller = this.controller;
    const keyboard = new KeyboardInput(window, {
      press: (dir) => {
        controller.press(dir);
      },
      release: (dir) => {
        controller.release(dir);
      },
      releaseAll: () => {
        controller.releaseAll();
      },
      zoomIn: () => {
        store.getState().zoomIn();
      },
      zoomOut: () => {
        store.getState().zoomOut();
      },
    });
    keyboard.attach();
    this.cleanups.push(
      () => {
        keyboard.detach();
      },
      store.subscribe((state, previous) => {
        if (state.zoom !== previous.zoom) camera.setZoom(state.zoom);
      }),
      events.on('camera:center', () => {
        this.centerOnAvatar();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup);
    store.getState().setLoad({ kind: 'ready' });
  }

  /** Texture of a style image, recolored once when the style is a color variant. */
  private styleTexture(key: string): string {
    const matrix = this.deps.theme.colorMatrix;
    if (matrix === null) return key;
    const variantKey = `${key}-variant`;
    if (!this.textures.exists(variantKey)) {
      const source = this.textures.get(key).getSourceImage();
      if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return key;
      this.textures.addCanvas(variantKey, recolorImage(source, matrix));
    }
    return variantKey;
  }

  override update(_time: number, delta: number): void {
    if (this.controller === null || this.avatar === null) return;
    this.controller.update(delta);
    const { position, dir, moving } = this.controller.snapshot;
    this.avatar.setTilePosition(position.x, position.y).setMotion(dir, moving);
  }

  private onLocalStep(step: LocalStep): void {
    const { map, store, events } = this.deps;
    store.getState().setLocalPlayer({ ...step, roomId: roomAt(map, step.x, step.y) });
    events.emit('local:step', step);
  }

  private centerOnAvatar(): void {
    if (this.avatar === null) return;
    const camera = this.cameras.main;
    camera.centerOn(this.avatar.x, this.avatar.y);
    camera.startFollow(this.avatar, true, CAMERA_LERP, CAMERA_LERP);
  }

  /** Meeting rooms: a soft border and the name on the floor (E3-S2). */
  private drawRooms(): void {
    const graphics = this.add.graphics().setDepth(ROOM_DEPTH);
    for (const room of this.deps.map.rooms) {
      const x = room.x * TILE_SIZE;
      const y = room.y * TILE_SIZE;
      const w = room.width * TILE_SIZE;
      const h = room.height * TILE_SIZE;
      graphics.fillStyle(0xffffff, 0.06).fillRect(x, y, w, h);
      graphics.lineStyle(2, 0xffffff, 0.55).strokeRect(x + 1, y + 1, w - 2, h - 2);
      const name = this.add
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
    }
  }

  private readonly cleanup = (): void => {
    for (const dispose of this.cleanups.splice(0)) dispose();
    this.controller = null;
    this.avatar = null;
  };
}
