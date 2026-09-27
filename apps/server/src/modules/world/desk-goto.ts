import { deskSpawnTile, type DeskArea, type Direction, type Tile } from '@bululu/shared';

import { AppError } from '../../platform/errors.js';
import { safeHandler, type BululuIo, type SafeHandlerDeps } from '../../platform/socket.js';
import type { BululuSocket } from '../../platform/socket.js';
import { KeyedTokenBuckets } from '../../platform/token-bucket.js';
import { socketUserId } from '../auth/index.js';
import type { WorldRepository } from './world.repository.js';
import type { WorldService } from './world.service.js';

/** "Mi escritorio" can be pressed a few times in a row, then once per second. */
const GOTO_BURST = 3;
const GOTO_PER_SECOND = 1;

/** Direction that faces the desk from a tile next to it. */
export function facingDesk(tile: Tile, desk: DeskArea): Direction {
  if (tile.y >= desk.y + desk.height) return 'up';
  if (tile.y < desk.y) return 'down';
  return tile.x < desk.x ? 'right' : 'left';
}

/**
 * `desk:goto` ("Mi escritorio", E9-S2): the avatar goes next to the person's desk, on the same
 * tile the server would spawn them on (validated like a spawn: walkable and outside meeting
 * rooms). The person gets `player:correct` with the tile; the others see the move in the next
 * `world:delta`. No desk, or a walled-in one → `UNKNOWN_DESK`.
 */
export async function gotoDesk(
  world: WorldService,
  repository: WorldRepository,
  socket: BululuSocket,
): Promise<void> {
  const userId = socketUserId(socket);
  const { spaceId } = socket.data;
  const joined = () => {
    const runtime = spaceId === undefined ? undefined : world.store.get(spaceId);
    return runtime?.socketOf(userId) === socket.id ? runtime : undefined;
  };
  const runtime = joined();
  if (runtime === undefined) throw new AppError('NOT_IN_SPACE', 'Join the space first');
  const member = await repository.findMember(runtime.spaceId, userId);
  const deskId = member?.deskId ?? null;
  const desk = deskId === null ? undefined : runtime.map.desks.find((d) => d.deskId === deskId);
  if (desk === undefined) throw new AppError('UNKNOWN_DESK', 'You have no desk in this space');
  const tile = deskSpawnTile(runtime.map, desk);
  if (tile === null) throw new AppError('UNKNOWN_DESK', 'Your desk cannot be reached');
  // The person may have left (or reconnected on another socket) while the desk was read.
  if (joined() !== runtime) return;
  world.roomChanged(runtime, userId, runtime.place(userId, tile, facingDesk(tile, desk)));
  socket.emit('player:correct', { x: tile.x, y: tile.y });
}

/** Registers the `desk:goto` handler on every connection (E9-S2). */
export function registerDeskGoto(
  io: BululuIo,
  deps: SafeHandlerDeps,
  world: WorldService,
  repository: WorldRepository,
  clock: () => number,
): void {
  // Per person, across all their connections (each press reads the membership, E8-S2).
  const presses = new KeyedTokenBuckets({
    capacity: GOTO_BURST,
    refillPerSecond: GOTO_PER_SECOND,
    now: clock,
  });
  io.on('connection', (socket) => {
    socket.on(
      'desk:goto',
      safeHandler(deps, socket, 'desk:goto', async () => {
        if (!presses.tryTake(socketUserId(socket)))
          throw new AppError('RATE_LIMITED', 'Too many "Mi escritorio"');
        await gotoDesk(world, repository, socket);
        return undefined;
      }),
    );
  });
}
