import { domainStep } from '../bridge/dispatch';
import { world } from '../ecs/core/world';
import { bossPhaseSystem, bossThresholdSystem, slamSystem } from '../ecs/systems/boss';
import { bodyCollisionSystem, projectileCollisionSystem } from '../ecs/systems/collision';
import { deathSystem, hurtFlashSystem, projectileSystem } from '../ecs/systems/combat';
import { inputSystem, movementSystem, snapshotSystem } from '../ecs/systems/motion';
import {
  attackSystem, dropSystem, durabilitySystem, flightSystem, heldFollowSystem, pickupSystem, stockSystem,
  stuckFollowSystem, throwSystem,
} from '../ecs/systems/weapons';

export const DT = 1 / 60;

// The order is written down here, not implied by imports. docs/ARCHITECTURE.md mirrors it.
export function tick(): void {
  snapshotSystem();
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
export function createFrameDriver(render: (alpha: number) => void) {
  let accumulator = 0;
  return (frameSeconds: number): void => {
    accumulator += Math.min(frameSeconds, MAX_FRAME_SECONDS);
    let steps = 0;
    while (accumulator >= DT && steps < MAX_TICKS_PER_FRAME) {
      tick();
      accumulator -= DT;
      steps++;
    }
    render(accumulator / DT);
  };
}
