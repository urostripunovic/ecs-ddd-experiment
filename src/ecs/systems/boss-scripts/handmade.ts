// The hand-made bosses, one coroutine per phase: the Warden, the Unchained and
// the Keeper. The phase is simulation state (bossThresholdSystem writes it);
// what the boss does while in it is choreography and restarts from the top on load.
import { Health, Jump } from '../../components';
import type { Script } from '../../core/script';
import { shareOf, ticks } from '../../core/units';
import type { EntityId } from '../../core/world';
import { HURRY_BELOW, PHASE_ONE_SLAM, PHASE_TWO_SLAM, SLAM_RANGE, angleToPlayer, approach, burst, cone, distanceToPlayer, dropIn, jump, roar, shouldEvade, slam, strafe } from './moves';
import { ring, spiral, storm } from './patterns';

// Phase 1: lumbers toward the player and slams; kept at range, it alternates
// an aimed cone with a jump onto the player.
export function* phaseOne(boss: EntityId): Script {
  // Spawned on a perch (some arenas): its first move is to come down.
  if (Jump.fromHeight[boss] > 0) yield* dropIn(boss);
  let farTurns = 0;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* approach(boss, ticks(70), 2.6);
    if (distanceToPlayer(boss) > SLAM_RANGE) {
      if (farTurns++ % 2 === 0) yield* cone(boss, 3, 3, 0.22);
      else yield* jump(boss, 'at');
      continue;
    }
    yield* slam(boss, PHASE_ONE_SLAM);
  }
}

// Phase 2: opens with a roar; then bursts and cones between strafes, then its one chain: a cone that
// rolls straight into loading a jump, before a faster, wider slam.
export function* phaseTwo(boss: EntityId): Script {
  // Loading a save in phase 2 replays the roar too: it's how the phase begins, not a saved event.
  yield* roar(boss);
  let offset = 0;
  let dir: 1 | -1 = 1;
  for (;;) {
    for (let i = 0; i < 3; i++) {
      if (shouldEvade(boss)) yield* jump(boss, 'away');
      yield* burst(boss, 18, offset);
      offset += Math.PI / 18;
      yield* strafe(boss, ticks(12), 4, dir);
      yield* cone(boss, 1, 5, 0.16);
      yield* strafe(boss, ticks(13), 4, dir);
    }
    dir = dir === 1 ? -1 : 1;
    yield* cone(boss, 1, 5, 0.16);
    yield* jump(boss, 'at');
    const urgency = shareOf(Health.hp[boss], Health.max[boss]) < HURRY_BELOW ? 1.4 : 1;
    yield* approach(boss, ticks(50), 3.2 * urgency);
    yield* slam(boss, PHASE_TWO_SLAM);
  }
}

// The Unchained, phase 1: short approaches and no slow walks. It opens every
// third turn with a gap ring aimed so a gap starts on you, then slams up close or
// fires and jumps from range.
export function* unchainedOne(boss: EntityId): Script {
  if (Jump.fromHeight[boss] > 0) yield* dropIn(boss);
  let turn = 0;
  let dir: 1 | -1 = 1;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* approach(boss, ticks(40), 3.4);
    const far = distanceToPlayer(boss) > SLAM_RANGE;
    switch (turn++ % 3) {
      case 0:
        yield* ring(boss, 3, angleToPlayer(boss), dir);
        dir = dir === 1 ? -1 : 1;
        break;
      case 1:
        if (far) yield* cone(boss, 2, 5, 0.18);
        else yield* slam(boss, PHASE_ONE_SLAM);
        break;
      default:
        if (far) yield* jump(boss, 'at');
        else yield* slam(boss, PHASE_ONE_SLAM);
    }
  }
}

// Phase 2: the roar (which brings out the pillars' spikes), then a spiral, a
// longer ring, and its chain: a cone straight into a jump, then a slam.
export function* unchainedTwo(boss: EntityId): Script {
  yield* roar(boss);
  let dir: 1 | -1 = 1;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* spiral(boss, angleToPlayer(boss) + Math.PI / 3, dir);
    yield* strafe(boss, ticks(14), 4.5, dir);
    yield* ring(boss, 4, angleToPlayer(boss), dir);
    dir = dir === 1 ? -1 : 1;
    yield* cone(boss, 1, 7, 0.14);
    yield* jump(boss, 'at');
    const urgency = shareOf(Health.hp[boss], Health.max[boss]) < HURRY_BELOW ? 1.4 : 1;
    yield* approach(boss, ticks(30), 4 * urgency);
    yield* slam(boss, PHASE_TWO_SLAM);
  }
}

// The Keeper, phase 1: the Warden's lesson, move for move.
export const keeperOne = phaseOne;

// Phase 2: the Unchained's lesson. The roar brings the pillars' spikes out.
export function* keeperTwo(boss: EntityId): Script {
  yield* roar(boss);
  let dir: 1 | -1 = 1;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* ring(boss, 3, angleToPlayer(boss), dir);
    yield* strafe(boss, ticks(12), 4.5, dir);
    yield* spiral(boss, angleToPlayer(boss) + Math.PI / 3, dir);
    dir = dir === 1 ? -1 : 1;
    yield* cone(boss, 1, 7, 0.14);
    yield* jump(boss, 'at');
    yield* approach(boss, ticks(30), 3.8);
    yield* slam(boss, PHASE_TWO_SLAM);
  }
}

// Phase 3: everything at once, as fast as the lessons allow. A second roar, then
// the storm, straight into a jump, a long ring and a slam.
export function* keeperThree(boss: EntityId): Script {
  yield* roar(boss);
  let dir: 1 | -1 = 1;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* storm(boss, angleToPlayer(boss), dir);
    yield* jump(boss, 'at');
    yield* ring(boss, 4, angleToPlayer(boss), dir);
    dir = dir === 1 ? -1 : 1;
    yield* cone(boss, 1, 7, 0.14);
    yield* jump(boss, 'at');
    yield* approach(boss, ticks(24), 4.4);
    yield* slam(boss, PHASE_TWO_SLAM);
  }
}

