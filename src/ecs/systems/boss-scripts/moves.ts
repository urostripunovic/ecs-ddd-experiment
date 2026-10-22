// The boss's moves: walking, slams, cones and bursts, jumps, the roar, and the
// helpers every script shares. Every attack goes through begin()/finish(),
// so attacks never overlap and the gaps between them come from one table.
import { Arena, BossPace, C, Collider, Health, Jump, Knockback, Pressure, Shake, ShapeKind, Slam, TeamId, Transform, Velocity } from '../../components';
import { helperBuf, scriptBuf } from '../../core/buffers';
import { waitTicks } from '../../core/script';
import type { Script } from '../../core/script';
import { after, hp, inSeconds, inTicks, meters, plus, seconds, share, shareOf, ticks } from '../../core/units';
import type { Hp, Meters, Ticks } from '../../core/units';
import { add, entityAt, mask, query, remove, toHandle, world } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnProjectile } from '../../prefabs';
import { Action, BURST_WINDUP, CONE_VOLLEY_GAP, CONE_WINDUP, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER, ROAR_HOLD, ROAR_REAR, begin, finish } from '../boss-actions';
import { startCutscene } from '../cutscene';

export const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health);

export const PILLARS = mask(C.Transform, C.Collider, C.Solid);

export const BURST_SPEED = 12;

export const AIMED_SPEED = 16;

// Beyond this the slam can't reach, so the boss answers from range instead.
export const SLAM_RANGE = 6.5;

export const EVADE_DISTANCE = 8;

// Losing more than this share of max hp in a second makes it jump clear,
// at most once per cooldown, so it can't hide in the air.
export const EVADE_LOSS = share(0.06);

export const EVADE_COOLDOWN = inTicks(seconds(8));

// Below this share of max hp, phase 2 hurries in for the slam.
export const HURRY_BELOW = share(0.25);

export const ENEMY_BULLET_DMG = hp(10);

export const ENEMY_BULLET_LIFE = seconds(4);

export const ORB_DMG = hp(15);

// slowFor: how long the hit slows whoever it lands on.
export type SlamDef = { readonly windup: Ticks; readonly radius: Meters; readonly dmg: Hp; readonly slowFor: Ticks };

// The stamp hits hard but doesn't slow: its answer is to dodge through it.
export const PHASE_ONE_SLAM: SlamDef = { windup: ticks(42), radius: meters(4.5), dmg: hp(30), slowFor: ticks(0) };

// Faster and wider: phase 2 punishes standing close.
export const PHASE_TWO_SLAM: SlamDef = { windup: ticks(30), radius: meters(5.5), dmg: hp(30), slowFor: ticks(0) };

// A jump is a light hit: its threat is the slow and the repositioning, not the damage.
// The windup is the flight, so the telegraph fills while it's in the air.
export const JUMP_SLAM: SlamDef = { windup: JUMP_AIR, radius: meters(3), dmg: hp(12), slowFor: inTicks(seconds(1)) };

export function findPlayer(): EntityId | -1 {
  return query(scriptBuf, LIVE_PLAYERS, C.Dead) > 0 ? entityAt(scriptBuf, 0) : -1;
}

export function stop(boss: EntityId): void {
  Velocity.x[boss] = Velocity.z[boss] = 0;
}

// Walks toward the player, stopping short so the slam has room to land.
export function* approach(boss: EntityId, length: Ticks, speed: number): Script {
  for (let i = 0; i < length; i++) {
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
export function* strafe(boss: EntityId, length: Ticks, speed: number, dir: 1 | -1): Script {
  for (let i = 0; i < length; i++) {
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

export function startSlam(boss: EntityId, x: number, z: number, def: SlamDef): void {
  Slam.timer[boss] = Slam.windup[boss] = def.windup;
  Slam.radius[boss] = def.radius;
  Slam.dmg[boss] = def.dmg;
  Slam.slowFor[boss] = def.slowFor;
  Slam.x[boss] = x;
  Slam.z[boss] = z;
  add(boss, C.Slam);
}

// The telegraph is the gameplay: slamSystem lands the hit when the timer runs out.
export function* slam(boss: EntityId, def: SlamDef): Script {
  yield* begin(boss, Action.Slam);
  stop(boss);
  startSlam(boss, Transform.x[boss], Transform.z[boss], def);
  yield* waitTicks(def.windup);
  finish(boss);
}

// A deeper boss's bullets are a little faster: half its extra pace, so patterns
// stay readable while the gaps between them shrink.
export function shoot(boss: EntityId, angle: number, speed: number): void {
  spawnProjectile(
    Transform.x[boss], Transform.z[boss], Math.cos(angle), Math.sin(angle), bulletSpeed(boss, speed),
    TeamId.Enemy, toHandle(boss), ENEMY_BULLET_DMG, ENEMY_BULLET_LIFE, ShapeKind.EnemyBullet,
  );
}

export function bulletSpeed(boss: EntityId, speed: number): number {
  const pace = BossPace.pace[boss] > 0 ? BossPace.pace[boss] : 1;
  return speed * (1 + (pace - 1) / 2);
}

// A narrow fan aimed at the player: the answer to keeping your distance.
export function fan(boss: EntityId, count: number, spread: number): void {
  const p = findPlayer();
  if (p === -1) return;
  const at = Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
  for (let i = 0; i < count; i++) shoot(boss, at + (i - (count - 1) / 2) * spread, AIMED_SPEED);
}

export function* cone(boss: EntityId, volleys: number, count: number, spread: number, windup: Ticks = CONE_WINDUP): Script {
  yield* begin(boss, Action.Cone, windup);
  stop(boss);
  yield* waitTicks(windup);
  for (let v = 0; v < volleys; v++) {
    fan(boss, count, spread);
    if (v < volleys - 1) yield* waitTicks(CONE_VOLLEY_GAP);
  }
  finish(boss);
}

export function* burst(boss: EntityId, count: number, offset: number, windup: Ticks = BURST_WINDUP): Script {
  yield* begin(boss, Action.Burst, windup);
  stop(boss);
  yield* waitTicks(windup);
  for (let i = 0; i < count; i++) shoot(boss, offset + (i / count) * Math.PI * 2, BURST_SPEED);
  finish(boss);
}

export function angleToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
}

// Where a jump comes down: on the player, or away from them. Chosen at take-off
// and shown at once, so the player always gets the full flight time to react.
export function landingSpot(boss: EntityId, mode: JumpMode, out: { x: number; z: number }): void {
  const p = findPlayer();
  let x = Transform.x[boss];
  let z = Transform.z[boss];
  if (p !== -1 && mode === 'at') {
    x = Transform.x[p];
    z = Transform.z[p];
  } else if (p !== -1 && mode === 'toward') {
    const dx = Transform.x[p] - x;
    const dz = Transform.z[p] - z;
    const d = Math.hypot(dx, dz) || 1;
    x += (dx / d) * DROP_DISTANCE;
    z += (dz / d) * DROP_DISTANCE;
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

export const spot = { x: 0, z: 0 };

// 'toward' lands a set distance toward the player rather than on them: the
// entrance drop announces the fight without opening it with a hit.
export type JumpMode = 'at' | 'away' | 'toward';

export const DROP_DISTANCE = 6;

// Crouch, fly, land. The landing is an ordinary slam centred on the landing
// spot, so it shares the slam's telegraph, damage and slow.
export function* jump(boss: EntityId, mode: JumpMode): Script {
  yield* begin(boss, Action.Jump);
  stop(boss);
  yield* waitTicks(JUMP_CROUCH);

  landingSpot(boss, mode, spot);
  const tx = spot.x;
  const tz = spot.z;
  const flight = inSeconds(JUMP_AIR);
  Velocity.x[boss] = (tx - Transform.x[boss]) / flight;
  Velocity.z[boss] = (tz - Transform.z[boss]) / flight;
  add(boss, C.Airborne);
  startSlam(boss, tx, tz, JUMP_SLAM);
  Jump.airStart[boss] = world.tick;
  Jump.landAt[boss] = after(JUMP_AIR);
  yield* waitTicks(JUMP_AIR);

  remove(boss, C.Airborne);
  Jump.fromHeight[boss] = 0;
  stop(boss);
  // Integrating a velocity drifts by a hair; landing exactly on the telegraph keeps it honest.
  Transform.x[boss] = tx;
  Transform.z[boss] = tz;
  yield* waitTicks(JUMP_RECOVER);
  finish(boss);
}

export const ROAR_PUSH_RADIUS = 7;

export const ROAR_PUSH_SPEED = 9;

export const ROAR_PUSH = ticks(15);

// Clears space for phase 2's bursts: anyone close is shoved outward.
export function roarPush(boss: EntityId): void {
  const p = findPlayer();
  if (p === -1) return;
  const dx = Transform.x[p] - Transform.x[boss];
  const dz = Transform.z[p] - Transform.z[boss];
  const d = Math.hypot(dx, dz);
  if (d > ROAR_PUSH_RADIUS) return;
  Knockback.x[p] = (d === 0 ? 0 : dx / d) * ROAR_PUSH_SPEED;
  Knockback.z[p] = (d === 0 ? 1 : dz / d) * ROAR_PUSH_SPEED;
  Knockback.until[p] = after(ROAR_PUSH);
}

// The cutscene that opens phase 2. Rears up first so the player sees it coming;
// the shake and shove land on the roar itself. It can't be burst down mid-roar.
export function* roar(boss: EntityId): Script {
  yield* begin(boss, Action.Roar);
  stop(boss);
  add(boss, C.Invulnerable);
  startCutscene(plus(ROAR_REAR, ROAR_HOLD));
  yield* waitTicks(ROAR_REAR);
  Shake.trauma = 1;
  roarPush(boss);
  yield* waitTicks(ROAR_HOLD);
  remove(boss, C.Invulnerable);
  finish(boss);
}

// An entrance from a perch: the player watches it crouch up there and drop in,
// and can't act until it lands, so the fight starts on equal terms.
export function* dropIn(boss: EntityId): Script {
  startCutscene(plus(JUMP_CROUCH, JUMP_AIR));
  yield* jump(boss, 'toward');
}

export function shouldEvade(boss: EntityId): boolean {
  if (world.tick < Pressure.evadeReadyAt[boss]) return false;
  if (shareOf(Pressure.recentLoss[boss], Health.max[boss]) <= EVADE_LOSS) return false;
  Pressure.evadeReadyAt[boss] = after(EVADE_COOLDOWN);
  return true;
}

export function distanceToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.hypot(Transform.x[p] - Transform.x[boss], Transform.z[p] - Transform.z[boss]);
}
