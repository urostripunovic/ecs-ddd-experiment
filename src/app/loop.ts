import { domainStep } from '../bridge/dispatch';
import { applyDevCommands } from './dev/commands';
import { inSeconds, ticks } from '../ecs/core/units';
import { world } from '../ecs/core/world';
import { bossPhaseSystem, bossThresholdSystem, slamSystem } from '../ecs/systems/boss';
import { bodyCollisionSystem, projectileCollisionSystem } from '../ecs/systems/collision';
import { deathSystem, hurtFlashSystem, projectileSystem } from '../ecs/systems/combat';
import { shakeSystem } from '../ecs/systems/cutscene';
import { tunnelSystem } from '../ecs/systems/tunnel';
import { inputSystem, movementSystem, snapshotSystem } from '../ecs/systems/motion';
import {
  attackSystem, dropSystem, durabilitySystem, flightSystem, heldFollowSystem, pickupSystem, stockSystem,
  stuckFollowSystem, throwSystem,
} from '../ecs/systems/weapons';

export const DT = inSeconds(ticks(1));

// The order is written down here, not implied by imports. docs/ARCHITECTURE.md mirrors it.
export function tick(): void {
  // Dev builds only: cheats are inputs, applied before any system runs.
  if (import.meta.env.DEV) applyDevCommands();
  snapshotSystem();
  shakeSystem();
  inputSystem();
  bossPhaseSystem();
  movementSystem(DT);
  bodyCollisionSystem();
  heldFollowSystem();
  stuckFollowSystem();
  throwSystem();
  attackSystem(DT);
  flightSystem();
  pickupSystem();
  projectileCollisionSystem();
  projectileSystem(DT);
  slamSystem();
  durabilitySystem(DT);
  stockSystem();
  hurtFlashSystem();
  dropSystem();
  bossThresholdSystem();
  tunnelSystem();
  deathSystem();
  domainStep(); // decide + evolve + project, inside the same tick
  world.tick++;
}

// Caps how far a long hitch (tab switch, GC pause) can push the simulation,
// so a slow frame never triggers a "spiral of death" of catch-up ticks.
const MAX_FRAME_SECONDS = 0.25;
const MAX_TICKS_PER_FRAME = 8;

// Rendered frames and simulation ticks are decoupled: the sim only ever
// advances in DT steps, and render gets how far it is towards the next one.
// Dev time controls. They change how fast the simulation is driven, never what
// a tick does, so a paused or slowed run is the same run.
export const timeControl = { paused: false, steps: 0, scale: 1 };

export function createFrameDriver(render: (alpha: number) => void) {
  let accumulator = 0;
  return (frameSeconds: number): void => {
    if (timeControl.paused) {
      for (; timeControl.steps > 0; timeControl.steps--) tick();
      render(0);
      return;
    }
    accumulator += Math.min(frameSeconds * timeControl.scale, MAX_FRAME_SECONDS);
    let steps = 0;
    while (accumulator >= DT && steps < MAX_TICKS_PER_FRAME) {
      tick();
      accumulator -= DT;
      steps++;
    }
    render(accumulator / DT);
  };
}
