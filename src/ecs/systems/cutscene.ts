import { Cutscene, MatchStatus, MatchView, Shake } from '../components';
import { world } from '../core/world';

// Shake decays over about 0.8 s, per tick rather than per frame, so it lasts
// the same whatever the frame rate.
const SHAKE_DECAY_PER_TICK = 1.2 / 60;

// The player can act only while fighting and outside a cutscene.
export const controlsLocked = () =>
  MatchView.status !== MatchStatus.Fighting || world.tick < Cutscene.until;

export function startCutscene(ticks: number): void {
  Cutscene.until = Math.max(Cutscene.until, world.tick + ticks);
}

// reads Shake | writes Shake
export function shakeSystem(): void {
  Shake.trauma = Math.max(0, Shake.trauma - SHAKE_DECAY_PER_TICK);
}
