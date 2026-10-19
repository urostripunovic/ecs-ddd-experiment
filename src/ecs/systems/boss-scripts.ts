// One coroutine per boss phase. The phase is domain truth (saved); what the
// boss does while in it is choreography and restarts from the top on load.
import { C, Health, ShapeKind, Slam, TeamId, Transform, Velocity } from '../components';
import { scriptBuf } from '../core/buffers';
import { waitTicks, type Script } from '../core/script';
import { add, entityAt, mask, query, toHandle, type EntityId } from '../core/world';
import { spawnProjectile } from '../prefabs';

const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health);
const BURST_SPEED = 12;
const AIMED_SPEED = 16;
// Beyond this the slam can't reach, so the boss answers with aimed fire instead.
const SLAM_RANGE = 6.5;

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

// The telegraph is the gameplay: slamSystem lands the hit when the timer runs out.
function* slam(boss: EntityId, windup: number, radius: number, dmg: number): Script {
  stop(boss);
  Slam.timer[boss] = Slam.windup[boss] = windup;
  Slam.radius[boss] = radius;
  Slam.dmg[boss] = dmg;
  add(boss, C.Slam);
  yield* waitTicks(windup);
}

function shoot(boss: EntityId, angle: number, speed: number): void {
  spawnProjectile(
    Transform.x[boss], Transform.z[boss], Math.cos(angle), Math.sin(angle), speed,
    TeamId.Enemy, toHandle(boss), 10, 4, ShapeKind.EnemyBullet,
  );
}

function burst(boss: EntityId, count: number, offset: number): void {
  for (let i = 0; i < count; i++) shoot(boss, offset + (i / count) * Math.PI * 2, BURST_SPEED);
}

// A narrow fan at the player: the answer to keeping your distance.
function fan(boss: EntityId, count: number, spread: number): void {
  const p = findPlayer();
  if (p === -1) return;
  const at = Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
  for (let i = 0; i < count; i++) shoot(boss, at + (i - (count - 1) / 2) * spread, AIMED_SPEED);
}

function distanceToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.hypot(Transform.x[p] - Transform.x[boss], Transform.z[p] - Transform.z[boss]);
}

// Phase 1: lumbers toward the player and slams; fires a volley if kept at range.
export function* phaseOne(boss: EntityId): Script {
  for (;;) {
    yield* approach(boss, 70, 2.6);
    if (distanceToPlayer(boss) > SLAM_RANGE) {
      stop(boss);
      for (let i = 0; i < 3; i++) {
        fan(boss, 3, 0.22);
        yield* waitTicks(14);
      }
      continue;
    }
    yield* slam(boss, 42, 4.5, 30);
    yield* waitTicks(25);
  }
}

// Phase 2: radial bursts and aimed fans between strafes, and a faster, wider slam.
export function* phaseTwo(boss: EntityId): Script {
  let offset = 0;
  let dir: 1 | -1 = 1;
  for (;;) {
    for (let i = 0; i < 3; i++) {
      burst(boss, 18, offset);
      offset += Math.PI / 18;
      yield* strafe(boss, 12, 4, dir);
      fan(boss, 5, 0.16);
      yield* strafe(boss, 13, 4, dir);
    }
    dir = dir === 1 ? -1 : 1;
    // Low hp makes it hurry in for the slam.
    const urgency = Health.hp[boss] < Health.max[boss] * 0.25 ? 1.4 : 1;
    yield* approach(boss, 50, 3.2 * urgency);
    yield* slam(boss, 30, 5.5, 30);
    yield* waitTicks(20);
  }
}
