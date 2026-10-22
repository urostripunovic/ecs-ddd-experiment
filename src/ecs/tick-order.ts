// The simulation's systems in the order every tick runs them: the game's loop
// and the tests both step from this list, so a test can run fewer systems but
// never a different order, and never a system the game doesn't run.
import { bossPhaseSystem, bossThresholdSystem, slamSystem } from './systems/boss';
import { bodyCollisionSystem, projectileCollisionSystem } from './systems/collision';
import { deathSystem, hurtFlashSystem, projectileSystem } from './systems/combat';
import { shakeSystem } from './systems/cutscene';
import { hazardSystem, homingSystem } from './systems/hazards';
import { inputSystem, movementSystem, snapshotSystem } from './systems/motion';
import { perkDropSystem } from './systems/perks';
import { orbitSystem, spikeGrowthSystem, spikeSystem } from './systems/pillars';
import { rewardSensorSystem } from './systems/rewards';
import { burnSystem, tracerSystem } from './systems/specials';
import { tunnelSystem } from './systems/tunnel';
import {
  attackSystem, dropSystem, durabilitySystem, flightSystem, heldFollowSystem, pickupSystem, returnSystem, stockSystem,
  stuckFollowSystem, throwSystem,
} from './systems/weapons';
import { streams } from './core/rng';
import { inSeconds, ticks, type Seconds } from './core/units';
import { world } from './core/world';

export const DT = inSeconds(ticks(1));

// Each system takes the tick's length; most ignore it. The few that draw at
// random are handed their own stream here, the one place that wires them up.
type System = (dt: Seconds) => void;

export const TICK_ORDER = [
  ['snapshotSystem', snapshotSystem],
  ['shakeSystem', shakeSystem],
  ['inputSystem', () => inputSystem(streams.dizzy)],
  ['bossPhaseSystem', bossPhaseSystem],
  ['homingSystem', homingSystem],
  ['movementSystem', movementSystem],
  ['orbitSystem', orbitSystem],
  ['bodyCollisionSystem', bodyCollisionSystem],
  ['heldFollowSystem', heldFollowSystem],
  ['stuckFollowSystem', stuckFollowSystem],
  ['throwSystem', throwSystem],
  ['attackSystem', (dt: Seconds) => attackSystem(dt, streams.bloom)],
  ['flightSystem', flightSystem],
  ['returnSystem', returnSystem],
  ['pickupSystem', pickupSystem],
  ['projectileCollisionSystem', projectileCollisionSystem],
  ['projectileSystem', projectileSystem],
  ['burnSystem', burnSystem],
  ['slamSystem', slamSystem],
  ['hazardSystem', hazardSystem],
  ['spikeSystem', spikeSystem],
  ['durabilitySystem', durabilitySystem],
  ['stockSystem', () => stockSystem(streams.stock)],
  ['hurtFlashSystem', hurtFlashSystem],
  ['tracerSystem', tracerSystem],
  ['dropSystem', () => dropSystem(streams.drops)],
  ['perkDropSystem', () => perkDropSystem(streams.perks)],
  ['bossThresholdSystem', bossThresholdSystem],
  ['spikeGrowthSystem', spikeGrowthSystem],
  ['tunnelSystem', tunnelSystem],
  ['rewardSensorSystem', rewardSensorSystem],
  ['deathSystem', deathSystem],
] as const satisfies readonly (readonly [string, System])[];

export type SystemName = (typeof TICK_ORDER)[number][0];

// Every system, in order. The game's tick; the rules step follows it.
export function runSystems(): void {
  for (let i = 0; i < TICK_ORDER.length; i++) TICK_ORDER[i][1](DT);
}

// For tests: a step that runs only the named systems, in the tick's own order
// whatever order they're named in, then advances the tick.
export function stepper(only: readonly SystemName[]): () => void {
  const runs = TICK_ORDER.map(([name]) => only.includes(name));
  return () => {
    for (let i = 0; i < TICK_ORDER.length; i++) if (runs[i]) TICK_ORDER[i][1](DT);
    world.tick++;
  };
}
