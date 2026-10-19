// One coroutine per boss phase. The phase is domain truth (saved); what the
// boss does while in it is choreography and restarts from the top on load.
// Every attack goes through begin()/finish() (boss-actions.ts), so attacks never
// overlap and the chain gaps between them come from one table.
import {
  Arena, C, Collider, Health, Jump, Knockback, Pressure, Shake, ShapeKind, Slam, TeamId, Transform, Velocity,
} from '../components';
import { helperBuf, scriptBuf } from '../core/buffers';
import { waitTicks, type Script } from '../core/script';
import { add, entityAt, mask, query, remove, toHandle, world, type EntityId } from '../core/world';
import { spawnProjectile } from '../prefabs';
import {
  Action, begin, BURST_WINDUP, CONE_VOLLEY_GAP, CONE_WINDUP, finish, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER,
  ROAR_HOLD, ROAR_REAR,
} from './boss-actions';
import { startCutscene } from './cutscene';

const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health);
const PILLARS = mask(C.Transform, C.Collider, C.Solid);
const BURST_SPEED = 12;
const AIMED_SPEED = 16;
// Beyond this the slam can't reach, so the boss answers from range instead.
const SLAM_RANGE = 6.5;
// A jump is a light hit: its threat is the slow and the repositioning, not the damage.
const JUMP_DMG = 12;
const JUMP_RADIUS = 3;
const EVADE_DISTANCE = 8;
// Losing more than this share of max hp in a second makes it jump clear,
// at most once per cooldown, so it can't hide in the air.
const EVADE_LOSS_SHARE = 0.06;
const EVADE_COOLDOWN_TICKS = 8 * 60;

function findPlayer(): EntityId | -1 {
  return query(scriptBuf, LIVE_PLAYERS, C.Dead) > 0 ? entityAt(scriptBuf, 0) : -1;
}

function stop(boss: EntityId): void {
  Velocity.x[boss] = Velocity.z[boss] = 0;
}

// Walks toward the player, stopping short so the slam has room to land.
function* approach(boss: EntityId, ticks: number, speed: number): Script {
  for (let i = 0; i < ticks; i++) {
    const p = findPlayer();
    if (p !== -1) {
      const dx = Transform.x[p] - Transform.x[boss];
      const dz = Transform.z[p] - Transform.z[boss];
      const d = Math.hypot(dx, dz);
      const s = d > 2.5 ? speed / d : 0;
      Velocity.x[boss] = dx * s;
      Velocity.z[boss] = dz * s;
    }
    yield;
  }
  stop(boss);
}

// Sidesteps relative to the player, so phase 2 reads as more evasive.
function* strafe(boss: EntityId, ticks: number, speed: number, dir: 1 | -1): Script {
  for (let i = 0; i < ticks; i++) {
    const p = findPlayer();
    if (p !== -1) {
      const dx = Transform.x[p] - Transform.x[boss];
      const dz = Transform.z[p] - Transform.z[boss];
      const d = Math.hypot(dx, dz) || 1;
      Velocity.x[boss] = (-dz / d) * speed * dir;
      Velocity.z[boss] = (dx / d) * speed * dir;
    }
    yield;
  }
  stop(boss);
}

function startSlam(boss: EntityId, x: number, z: number, windup: number, radius: number, dmg: number): void {
  Slam.timer[boss] = Slam.windup[boss] = windup;
  Slam.radius[boss] = radius;
  Slam.dmg[boss] = dmg;
  Slam.x[boss] = x;
  Slam.z[boss] = z;
  add(boss, C.Slam);
}

// The telegraph is the gameplay: slamSystem lands the hit when the timer runs out.
function* slam(boss: EntityId, windup: number, radius: number, dmg: number): Script {
  yield* begin(boss, Action.Slam);
  stop(boss);
  startSlam(boss, Transform.x[boss], Transform.z[boss], windup, radius, dmg);
  yield* waitTicks(windup);
  finish(boss);
}

function shoot(boss: EntityId, angle: number, speed: number): void {
  spawnProjectile(
    Transform.x[boss], Transform.z[boss], Math.cos(angle), Math.sin(angle), speed,
    TeamId.Enemy, toHandle(boss), 10, 4, ShapeKind.EnemyBullet,
  );
}

// A narrow fan aimed at the player: the answer to keeping your distance.
function fan(boss: EntityId, count: number, spread: number): void {
  const p = findPlayer();
  if (p === -1) return;
  const at = Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
  for (let i = 0; i < count; i++) shoot(boss, at + (i - (count - 1) / 2) * spread, AIMED_SPEED);
}

function* cone(boss: EntityId, volleys: number, count: number, spread: number): Script {
  yield* begin(boss, Action.Cone);
  stop(boss);
  yield* waitTicks(CONE_WINDUP);
  for (let v = 0; v < volleys; v++) {
    fan(boss, count, spread);
    if (v < volleys - 1) yield* waitTicks(CONE_VOLLEY_GAP);
  }
  finish(boss);
}

function* burst(boss: EntityId, count: number, offset: number): Script {
  yield* begin(boss, Action.Burst);
  stop(boss);
  yield* waitTicks(BURST_WINDUP);
  for (let i = 0; i < count; i++) shoot(boss, offset + (i / count) * Math.PI * 2, BURST_SPEED);
  finish(boss);
}

// Where a jump comes down: on the player, or away from them. Chosen at take-off
// and shown at once, so the player always gets the full flight time to react.
function landingSpot(boss: EntityId, mode: 'at' | 'away', out: { x: number; z: number }): void {
  const p = findPlayer();
  let x = Transform.x[boss];
  let z = Transform.z[boss];
  if (p !== -1 && mode === 'at') {
    x = Transform.x[p];
    z = Transform.z[p];
  } else if (p !== -1) {
    const dx = x - Transform.x[p];
    const dz = z - Transform.z[p];
    const d = Math.hypot(dx, dz) || 1;
    x += (dx / d) * EVADE_DISTANCE;
    z += (dz / d) * EVADE_DISTANCE;
  }
  const r = Collider.radius[boss];
  const limit = Arena.half - r - 0.5;
  x = Math.max(-limit, Math.min(limit, x));
  z = Math.max(-limit, Math.min(limit, z));
  const n = query(helperBuf, PILLARS, C.Dead);
  for (let i = 0; i < n; i++) {
    const s = entityAt(helperBuf, i);
    if (s === boss) continue;
    const dx = x - Transform.x[s];
    const dz = z - Transform.z[s];
    const min = Collider.radius[s] + r + 0.2;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    x = Transform.x[s] + (d === 0 ? 0 : dx / d) * min;
    z = Transform.z[s] + (d === 0 ? 1 : dz / d) * min;
  }
  out.x = x;
  out.z = z;
}

const spot = { x: 0, z: 0 };

// Crouch, fly, land. The landing is an ordinary slam centred on the landing
// spot, so it shares the slam's telegraph, damage and slow.
function* jump(boss: EntityId, mode: 'at' | 'away'): Script {
  yield* begin(boss, Action.Jump);
  stop(boss);
  yield* waitTicks(JUMP_CROUCH);

  landingSpot(boss, mode, spot);
  const tx = spot.x;
  const tz = spot.z;
  const seconds = JUMP_AIR / 60;
  Velocity.x[boss] = (tx - Transform.x[boss]) / seconds;
  Velocity.z[boss] = (tz - Transform.z[boss]) / seconds;
  add(boss, C.Airborne);
  startSlam(boss, tx, tz, JUMP_AIR, JUMP_RADIUS, JUMP_DMG);
  Jump.airStart[boss] = world.tick;
  Jump.landAt[boss] = world.tick + JUMP_AIR;
  yield* waitTicks(JUMP_AIR);

  remove(boss, C.Airborne);
  stop(boss);
  // Integrating a velocity drifts by a hair; landing exactly on the telegraph keeps it honest.
  Transform.x[boss] = tx;
  Transform.z[boss] = tz;
  yield* waitTicks(JUMP_RECOVER);
  finish(boss);
}

const ROAR_PUSH_RADIUS = 7;
const ROAR_PUSH_SPEED = 9;
const ROAR_PUSH_TICKS = 15;

// Clears space for phase 2's bursts: anyone close is shoved outward.
function roarPush(boss: EntityId): void {
  const p = findPlayer();
  if (p === -1) return;
  const dx = Transform.x[p] - Transform.x[boss];
  const dz = Transform.z[p] - Transform.z[boss];
  const d = Math.hypot(dx, dz);
  if (d > ROAR_PUSH_RADIUS) return;
  Knockback.x[p] = (d === 0 ? 0 : dx / d) * ROAR_PUSH_SPEED;
  Knockback.z[p] = (d === 0 ? 1 : dz / d) * ROAR_PUSH_SPEED;
  Knockback.until[p] = world.tick + ROAR_PUSH_TICKS;
}

// The cutscene that opens phase 2. Rears up first so the player sees it coming;
// the shake and shove land on the roar itself. It can't be burst down mid-roar.
function* roar(boss: EntityId): Script {
  yield* begin(boss, Action.Roar);
  stop(boss);
  add(boss, C.Invulnerable);
  startCutscene(ROAR_REAR + ROAR_HOLD);
  yield* waitTicks(ROAR_REAR);
  Shake.trauma = 1;
  roarPush(boss);
  yield* waitTicks(ROAR_HOLD);
  remove(boss, C.Invulnerable);
  finish(boss);
}

function shouldEvade(boss: EntityId): boolean {
  if (world.tick < Pressure.evadeReadyAt[boss]) return false;
  if (Pressure.recentLoss[boss] <= Health.max[boss] * EVADE_LOSS_SHARE) return false;
  Pressure.evadeReadyAt[boss] = world.tick + EVADE_COOLDOWN_TICKS;
  return true;
}

function distanceToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.hypot(Transform.x[p] - Transform.x[boss], Transform.z[p] - Transform.z[boss]);
}

// Phase 1: lumbers toward the player and slams; kept at range, it alternates
// an aimed cone with a jump onto the player.
export function* phaseOne(boss: EntityId): Script {
  let farTurns = 0;
  for (;;) {
    if (shouldEvade(boss)) yield* jump(boss, 'away');
    yield* approach(boss, 70, 2.6);
    if (distanceToPlayer(boss) > SLAM_RANGE) {
      if (farTurns++ % 2 === 0) yield* cone(boss, 3, 3, 0.22);
      else yield* jump(boss, 'at');
      continue;
    }
    yield* slam(boss, 42, 4.5, 30);
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
      yield* strafe(boss, 12, 4, dir);
      yield* cone(boss, 1, 5, 0.16);
      yield* strafe(boss, 13, 4, dir);
    }
    dir = dir === 1 ? -1 : 1;
    yield* cone(boss, 1, 5, 0.16);
    yield* jump(boss, 'at');
    // Low hp makes it hurry in for the slam.
    const urgency = Health.hp[boss] < Health.max[boss] * 0.25 ? 1.4 : 1;
    yield* approach(boss, 50, 3.2 * urgency);
    yield* slam(boss, 30, 5.5, 30);
  }
}
