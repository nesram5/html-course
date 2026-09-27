import type { PublicPlayer, WorldDelta } from '@plaza/shared';
import type * as Phaser from 'phaser';

import { AvatarSprite } from '../sprites/AvatarSprite';
import type { AvatarTextures } from './avatar-textures';
import {
  RemotePlayersModel,
  type RemotePlayer,
  type RemotePlayersRenderer,
} from './remote-players';

interface RemoteSprite {
  readonly sprite: AvatarSprite;
  avatarId: string;
  displayName: string;
  cancelTexture: () => void;
}

/**
 * Draws the other people of the space (E4-S5) with `AvatarSprite`s. The logic (interpolation,
 * fades, reconnecting transparency) is the framework-free `RemotePlayersModel`; this class only
 * creates, updates and destroys sprites. Sprites of avatars still loading are invisible (the
 * name shows) until their sheet arrives.
 */
export class RemotePlayersSystem implements RemotePlayersRenderer {
  private readonly model = new RemotePlayersModel(this);
  private readonly sprites = new Map<string, RemoteSprite>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly textures: AvatarTextures,
    private readonly placeholderTexture: string,
  ) {}

  get players(): readonly RemotePlayer[] {
    return this.model.players();
  }

  reset(players: readonly PublicPlayer[], now: number, selfId: string): void {
    this.model.reset(players, now, selfId);
  }

  applyDelta(delta: WorldDelta, now: number): void {
    this.model.applyDelta(delta, now);
  }

  /** Every frame. */
  update(now: number): void {
    this.model.update(now);
  }

  clear(): void {
    this.model.clear();
  }

  /** Depth of the name label of a player (debug probe), `undefined` when not drawn. */
  labelDepth(userId: string): number | undefined {
    return this.sprites.get(userId)?.sprite.nameLabel.depth;
  }

  create(player: RemotePlayer): void {
    const sprite = new AvatarSprite(this.scene, this.placeholderTexture, player.state.displayName)
      .setFigureVisible(false)
      .setOpacity(player.alpha)
      .setTilePosition(player.x, player.y)
      .setMotion(player.dir, false);
    const entry: RemoteSprite = {
      sprite,
      avatarId: player.state.avatarId,
      displayName: player.state.displayName,
      cancelTexture: () => undefined,
    };
    this.sprites.set(player.userId, entry);
    this.loadTexture(entry);
  }

  render(player: RemotePlayer): void {
    const entry = this.sprites.get(player.userId);
    if (entry === undefined) return;
    const { state } = player;
    entry.sprite
      .setTilePosition(player.x, player.y)
      .setMotion(player.dir, player.moving)
      .setOpacity(player.alpha);
    if (state.displayName !== entry.displayName) {
      entry.displayName = state.displayName;
      entry.sprite.setDisplayName(state.displayName);
    }
    if (state.avatarId !== entry.avatarId) {
      entry.avatarId = state.avatarId;
      this.loadTexture(entry);
    }
  }

  destroy(player: RemotePlayer): void {
    const entry = this.sprites.get(player.userId);
    if (entry === undefined) return;
    entry.cancelTexture();
    entry.sprite.destroy();
    this.sprites.delete(player.userId);
  }

  private loadTexture(entry: RemoteSprite): void {
    entry.cancelTexture();
    entry.cancelTexture = this.textures.request(entry.avatarId, (key) => {
      entry.sprite.setAvatarTexture(key).setFigureVisible(true);
    });
  }
}
