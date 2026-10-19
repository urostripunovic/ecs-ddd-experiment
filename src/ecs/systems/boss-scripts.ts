// One coroutine per boss phase. The phase is domain truth (saved); what the
// boss does while in it is choreography and restarts from the top on load.
import { C, Health, ShapeKind, Slam, TeamId, Transform, Velocity } from '../components';
import { scriptBuf } from '../core/buffers';
import { waitTicks, type Script } from '../core/script';
import { add, entityAt, mask, query, toHandle, type EntityId } from '../core/world';
import { spawnProjectile } from '../prefabs';

const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health);
const ENEMY_BULLET_SPEED = 11;

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

function burst(boss: EntityId, count: number, offset: number): void {
  const owner = toHandle(boss);
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    spawnProjectile(
      Transform.x[boss], Transform.z[boss], Math.cos(a), Math.sin(a), ENEMY_BULLET_SPEED,
      TeamId.Enemy, owner, 10, 4, ShapeKind.EnemyBullet,
    );
  }
}

// Phase 1: lumbers toward the player and slams.
export function* phaseOne(boss: EntityId): Script {
  for (;;) {
    yield* approach(boss, 90, 2.4);
    yield* slam(boss, 45, 4.5, 30);
    yield* waitTicks(30);
  }
}

// Phase 2: radial bursts between strafes, and a faster slam.
export function* phaseTwo(boss: EntityId): Script {
  let offset = 0;
  let dir: 1 | -1 = 1;
  for (;;) {
    for (let i = 0; i < 3; i++) {
      burst(boss, 14, offset);
      offset += Math.PI / 14;
      yield* strafe(boss, 25, 4, dir);
    }
    dir = dir === 1 ? -1 : 1;
    // Low hp makes it hurry in for the slam.
    const urgency = Health.hp[boss] < Health.max[boss] * 0.25 ? 1.4 : 1;
    yield* approach(boss, 50, 3.2 * urgency);
    yield* slam(boss, 32, 5, 30);
    yield* waitTicks(20);
  }
}
