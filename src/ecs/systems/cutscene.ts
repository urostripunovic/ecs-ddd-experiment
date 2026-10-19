import { Cutscene, RunStatus, RunView, Shake } from '../components';
import { after, TICKS_PER_SECOND, type Ticks } from '../core/units';
import { world } from '../core/world';

// Shake decays over about 0.8 s, per tick rather than per frame, so it lasts
// the same whatever the frame rate.
const SHAKE_DECAY_PER_TICK = 1.2 / TICKS_PER_SECOND;

// The player can act while fighting or after clearing an arena (to reach the
// tunnel), and never during a cutscene or once the run is over.
export const controlsLocked = () =>
  RunView.status === RunStatus.Won || RunView.status === RunStatus.Lost || world.tick < Cutscene.until;

export function startCutscene(length: Ticks): void {
  Cutscene.until = Math.max(Cutscene.until, after(length));
}

// reads Shake | writes Shake
export function shakeSystem(): void {
  Shake.trauma = Math.max(0, Shake.trauma - SHAKE_DECAY_PER_TICK);
}
