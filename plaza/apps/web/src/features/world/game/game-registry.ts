/**
 * Counts the Phaser games alive, without importing Phaser, so React code and tests can check
 * that leaving the space page frees the game (E3-S6).
 */
let liveGames = 0;

export function registerGame(): () => void {
  liveGames++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    liveGames--;
  };
}

export function liveGameCount(): number {
  return liveGames;
}
