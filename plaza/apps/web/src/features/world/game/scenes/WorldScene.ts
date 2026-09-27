import {
  REACTION_DURATION_MS,
  TICK_MS,
  TILE_SIZE,
  effectivePresence,
  roomAt,
  type Direction,
  type PlayerCorrect,
  type PresenceStatus,
  type ReactionEmoji,
  type SpaceSnapshot,
  type Tile,
  type WorldDelta,
  type WorldMap,
} from '@plaza/shared';
import * as Phaser from 'phaser';

import type { ThemeAssets } from '../../api/assets';
import type { EventBus, LocalStep } from '../../bridge/event-bus';
import type { OfficeStore } from '../../store/office-store';
import type { WorldStore } from '../../store/world-store';
import { recolorImage } from '../color-matrix';
import { CAMERA_LERP, LOCATE_MS, STEP_MS } from '../constants';
import { KeyboardInput } from '../controller/keyboard-input';
import { LocalPlayerController } from '../controller/local-player-controller';
import { setWorldProbe, type AvatarProbe } from '../game-registry';
import { attachOffice } from '../office/attach-office';
import { AvatarTextures } from '../remote/avatar-textures';
import { RemotePlayersSystem } from '../remote/RemotePlayersSystem';
import { StressDriver } from '../remote/stress';
import { ABOVE_DEPTH, AvatarSprite } from '../sprites/AvatarSprite';
import { BELOW_DEPTH, ROOM_DEPTH } from '../sprites/depth';
import { SCENES, TEXTURES } from '../textures';

export interface WorldSceneDeps {
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
  readonly displayName: string;
  /** Sprite sheet URL of a catalog avatar (remote players). */
  readonly avatarUrlOf: (avatarId: string) => string;
  readonly events: EventBus;
  readonly store: WorldStore;
  /** Office style and desks (E9). */
  readonly office: OfficeStore;
  /** Image URLs and color matrix of a style of this map, for live style changes (E9-S1). */
  readonly resolveTheme: (themeId: string) => Promise<ThemeAssets>;
  /** Sprite URL of a desk decoration object (E9-S3). */
  readonly decorUrlOf: (itemId: string) => string;
  /** Style ids of the template, loaded ahead so a style change is instant (E9 follow-up). */
  readonly listThemes?: () => Promise<readonly string[]>;
}

interface StressRun {
  readonly system: RemotePlayersSystem;
  readonly timer: Phaser.Time.TimerEvent;
}

/**
 * The office (E3-S2..S5, E4-S5): draws the style images (`below` → avatars → `above` → names),
 * the meeting room borders and names, the local avatar with its keyboard controller, the other
 * people of the space, and a camera that follows the local avatar inside the map bounds.
 *
 * The local avatar appears when the first `world:snapshot` arrives, on the tile the server
 * chose; later snapshots (reconnections) and `player:correct` move it where the server says.
 * Every listener it registers is removed on shutdown.
 */
export class WorldScene extends Phaser.Scene {
  private controller: LocalPlayerController | null = null;
  private avatar: AvatarSprite | null = null;
  private remote: RemotePlayersSystem | null = null;
  private avatarTextures: AvatarTextures | null = null;
  private stress: StressRun | null = null;
  /** userId of the local person (from the snapshot), to find their own `changed` entries. */
  private selfId: string | null = null;
  private selfPresence: { status: PresenceStatus; away: boolean } = {
    status: 'available',
    away: false,
  };
  /** "Localizar" in progress (E7-S2): who the camera follows and when it comes back. */
  private locating: { userId: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly deps: WorldSceneDeps) {
    super(SCENES.world);
  }

  create(): void {
    const { map, store, events } = this.deps;
    const width = map.width * TILE_SIZE;
    const height = map.height * TILE_SIZE;

    const belowKey = this.styleTexture(TEXTURES.below);
    const aboveKey = this.styleTexture(TEXTURES.above);
    const below = this.add.image(0, 0, belowKey).setOrigin(0).setDepth(BELOW_DEPTH);
    const above = this.add.image(0, 0, aboveKey).setOrigin(0).setDepth(ABOVE_DEPTH);
    this.drawRooms();
    const office = attachOffice(this, {
      ...this.deps,
      drawn: { belowKey, aboveKey, below, above, extraKeys: [TEXTURES.below, TEXTURES.above] },
    });

    this.avatarTextures = new AvatarTextures(this, this.deps.avatarUrlOf, TEXTURES.localAvatar);
    this.remote = new RemotePlayersSystem(this, this.avatarTextures, TEXTURES.localAvatar);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, width, height);
    camera.setRoundPixels(true);
    camera.setZoom(store.getState().zoom);
    camera.centerOn(width / 2, height / 2);

    const keyboard = new KeyboardInput(window, {
      press: (dir) => {
        this.controller?.press(dir);
      },
      release: (dir) => {
        this.controller?.release(dir);
      },
      releaseAll: () => {
        this.controller?.releaseAll();
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
      events.on('world:snapshot', (snapshot) => {
        this.applySnapshot(snapshot);
      }),
      events.on('world:delta', (delta) => {
        this.remote?.applyDelta(delta, this.game.loop.time);
        this.applySelfChanges(delta);
      }),
      events.on('camera:locate', ({ userId }) => {
        this.locate(userId);
      }),
      // Showing a desk (E9-S2) ends a "Localizar" in progress: its timer must not pull back.
      events.on('camera:desk', () => {
        this.stopLocating();
      }),
      events.on('avatar:reaction', ({ userId, emoji }) => {
        this.showReaction(userId, emoji);
      }),
      events.on('player:correct', (tile) => {
        this.correct(tile);
      }),
      events.on('debug:stress', ({ count }) => {
        this.startStress(count);
      }),
      office.dispose,
      setWorldProbe({
        fps: () => this.game.loop.actualFps,
        avatars: () => this.probeAvatars(),
        cameraTarget: () => this.locating?.userId ?? null,
        office: () => office.probe(),
      }),
      () => {
        this.stopStress();
        this.remote?.clear();
      },
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

  override update(time: number, delta: number): void {
    if (this.controller !== null && this.avatar !== null) {
      this.controller.update(delta);
      const { position, dir, moving } = this.controller.snapshot;
      this.avatar.setTilePosition(position.x, position.y).setMotion(dir, moving);
    }
    this.remote?.update(time);
    this.stress?.system.update(time);
  }

  /** Join or reconnection: the local avatar goes where the server says; others are redrawn. */
  private applySnapshot(snapshot: SpaceSnapshot): void {
    const { self } = snapshot;
    this.selfId = self.userId;
    if (this.controller === null) this.spawnLocal(self, self.dir);
    else this.controller.teleport(self, self.dir);
    this.avatar?.setInConversation(self.inConversation);
    this.publishLocal(self, self.dir);
    this.selfPresence = { status: self.status, away: self.away };
    this.avatar?.setPresence(effectivePresence(this.selfPresence));
    this.remote?.reset(snapshot.players, this.game.loop.time, self.userId);
  }

  /** Server-side changes of the local person: the 💬 of a hallway conversation (E5-S2). */
  /** Rejected step (E4-S3): back to the server tile, no reconciliation (architecture §9.3). */
  private correct(tile: PlayerCorrect): void {
    const controller = this.controller;
    if (controller === null) return;
    controller.teleport({ x: tile.x, y: tile.y });
    this.publishLocal(tile, controller.snapshot.dir);
  }

  private spawnLocal(start: Tile, dir: Direction): void {
    const { map } = this.deps;
    this.avatar = new AvatarSprite(this, TEXTURES.localAvatar, this.deps.displayName)
      .setTilePosition(start.x, start.y)
      .setMotion(dir, false);
    this.controller = new LocalPlayerController({
      map,
      start: { x: start.x, y: start.y },
      dir,
      stepMs: STEP_MS,
      onStep: (step) => {
        this.onLocalStep(step);
      },
    });
    this.cameras.main.startFollow(this.avatar, true, CAMERA_LERP, CAMERA_LERP);
    this.centerOnAvatar();
  }

  private publishLocal(tile: Tile, dir: Direction): void {
    const { map, store } = this.deps;
    store
      .getState()
      .setLocalPlayer({ x: tile.x, y: tile.y, dir, roomId: roomAt(map, tile.x, tile.y) });
  }

  private onLocalStep(step: LocalStep): void {
    this.publishLocal(step, step.dir);
    this.deps.events.emit('local:step', step);
  }

  /** Status and away of the local person come back in `changed` like everyone else's (E7-S1). */
  private applySelfChanges(delta: WorldDelta): void {
    for (const changed of delta.changed) {
      if (changed.userId !== this.selfId) continue;
      if (changed.inConversation !== undefined) {
        this.avatar?.setInConversation(changed.inConversation);
      }
      this.selfPresence = {
        status: changed.status ?? this.selfPresence.status,
        away: changed.away ?? this.selfPresence.away,
      };
      this.avatar?.setPresence(effectivePresence(this.selfPresence));
    }
  }

  private spriteOf(userId: string): AvatarSprite | undefined {
    if (userId === this.selfId) return this.avatar ?? undefined;
    return this.remote?.spriteOf(userId);
  }

  /**
   * "Localizar" (E7-S2): the camera glides to the person, stays 3 s (wall clock: the scene clock
   * slows down in background tabs), then glides back.
   */
  private locate(userId: string): void {
    const target = this.spriteOf(userId);
    if (target === undefined || this.avatar === null) return;
    this.stopLocating();
    this.cameras.main.startFollow(target, true, CAMERA_LERP, CAMERA_LERP);
    const timer = setTimeout(() => {
      this.locating = null;
      if (this.avatar !== null) {
        this.cameras.main.startFollow(this.avatar, true, CAMERA_LERP, CAMERA_LERP);
      }
    }, LOCATE_MS);
    this.locating = { userId, timer };
  }

  private stopLocating(): void {
    if (this.locating !== null) clearTimeout(this.locating.timer);
    this.locating = null;
  }

  private showReaction(userId: string, emoji: ReactionEmoji): void {
    this.spriteOf(userId)?.showReaction(emoji, REACTION_DURATION_MS);
  }

  private centerOnAvatar(): void {
    this.stopLocating();
    if (this.avatar === null) return;
    const camera = this.cameras.main;
    camera.centerOn(this.avatar.x, this.avatar.y);
    camera.startFollow(this.avatar, true, CAMERA_LERP, CAMERA_LERP);
  }

  /** Development only (E4-S5 performance): fake people walking through the real system. */
  private startStress(count: number): void {
    this.stopStress();
    if (!import.meta.env.DEV || count <= 0 || this.avatarTextures === null) return;
    const driver = new StressDriver(this.deps.map, count);
    const system = new RemotePlayersSystem(this, this.avatarTextures, TEXTURES.localAvatar);
    system.reset(driver.players(), this.game.loop.time, '');
    const timer = this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => {
        system.applyDelta(driver.tick(), this.game.loop.time);
      },
    });
    this.stress = { system, timer };
  }

  private stopStress(): void {
    if (this.stress === null) return;
    this.stress.timer.remove();
    this.stress.system.clear();
    this.stress = null;
  }

  private probeAvatars(): AvatarProbe[] {
    const avatars: AvatarProbe[] = [];
    if (this.controller !== null && this.avatar !== null) {
      const { tile, position, moving } = this.controller.snapshot;
      avatars.push({
        userId: null,
        tileX: tile.x,
        tileY: tile.y,
        x: position.x,
        y: position.y,
        alpha: this.avatar.alpha,
        moving,
        labelAboveArt: this.avatar.nameLabel.depth > ABOVE_DEPTH,
        presence: this.avatar.presenceState,
        reaction: this.avatar.currentReaction,
        inConversation: this.avatar.inConversation,
      });
    }
    for (const system of [this.remote, this.stress?.system]) {
      for (const player of system?.players ?? []) {
        avatars.push({
          userId: player.userId,
          tileX: player.state.x,
          tileY: player.state.y,
          x: player.x,
          y: player.y,
          alpha: player.alpha,
          moving: player.moving,
          labelAboveArt: (system?.labelDepth(player.userId) ?? 0) > ABOVE_DEPTH,
          presence: effectivePresence(player.state),
          reaction: system?.spriteOf(player.userId)?.currentReaction ?? null,
          inConversation: system?.inConversation(player.userId) ?? false,
        });
      }
    }
    return avatars;
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
    this.stopLocating();
    for (const dispose of this.cleanups.splice(0)) dispose();
    this.controller = null;
    this.avatar = null;
    this.remote = null;
    this.avatarTextures = null;
  };
}
