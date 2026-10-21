// One coroutine per boss phase. The phase is simulation state (bossThresholdSystem
// writes it); what the boss does while in it is choreography and restarts from
// the top on load.
// Every attack goes through begin()/finish() (boss-actions.ts), so attacks never
// overlap and the chain gaps between them come from one table.
import {
  Arena, BossAction, BossGen, BossPace, BossPhase, C, Collider, Health, Homing, Jump, Knockback, Line, LineState, Pattern, Pressure, Shake,
  ShapeKind, Slam, TeamId, Transform, Velocity,
} from '../components';
import { Body, planFor, type BodyKind, type Move, type OrbsDef, type RingDef, type SpiralDef } from '../bosses/generate';
import { helperBuf, scriptBuf } from '../core/buffers';
import { waitTicks, type Script } from '../core/script';
import {
  after, hp, inSeconds, inTicks, meters, plus, seconds, share, shareOf, ticks, type Hp, type Meters, type Ticks,
} from '../core/units';
import { add, entityAt, mask, query, remove, toHandle, world, type EntityId } from '../core/world';
import { spawnProjectile } from '../prefabs';
import {
  Action, begin, BURST_WINDUP, CONE_VOLLEY_GAP, CONE_WINDUP, finish, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER,
  RING_WAVE_GAP, RING_WINDUP, ROAR_HOLD, ROAR_REAR, SPIRAL_LENGTH, SPIRAL_WINDUP, STORM_LENGTH, STORM_WINDUP,
} from './boss-actions';
import { startCutscene } from './cutscene';

const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health);
const PILLARS = mask(C.Transform, C.Collider, C.Solid);
export const BURST_SPEED = 12;
export const AIMED_SPEED = 16;
// Beyond this the slam can't reach, so the boss answers from range instead.
const SLAM_RANGE = 6.5;
const EVADE_DISTANCE = 8;
// Losing more than this share of max hp in a second makes it jump clear,
// at most once per cooldown, so it can't hide in the air.
const EVADE_LOSS = share(0.06);
const EVADE_COOLDOWN = inTicks(seconds(8));
// Below this share of max hp, phase 2 hurries in for the slam.
const HURRY_BELOW = share(0.25);
const ENEMY_BULLET_DMG = hp(10);
const ENEMY_BULLET_LIFE = seconds(4);
const ORB_DMG = hp(15);

// slowFor: how long the hit slows whoever it lands on.
type SlamDef = { readonly windup: Ticks; readonly radius: Meters; readonly dmg: Hp; readonly slowFor: Ticks };
// The stamp hits hard but doesn't slow: its answer is to dodge through it.
const PHASE_ONE_SLAM: SlamDef = { windup: ticks(42), radius: meters(4.5), dmg: hp(30), slowFor: ticks(0) };
// Faster and wider: phase 2 punishes standing close.
const PHASE_TWO_SLAM: SlamDef = { windup: ticks(30), radius: meters(5.5), dmg: hp(30), slowFor: ticks(0) };
// A jump is a light hit: its threat is the slow and the repositioning, not the damage.
// The windup is the flight, so the telegraph fills while it's in the air.
const JUMP_SLAM: SlamDef = { windup: JUMP_AIR, radius: meters(3), dmg: hp(12), slowFor: inTicks(seconds(1)) };

function findPlayer(): EntityId | -1 {
  return query(scriptBuf, LIVE_PLAYERS, C.Dead) > 0 ? entityAt(scriptBuf, 0) : -1;
}

function stop(boss: EntityId): void {
  Velocity.x[boss] = Velocity.z[boss] = 0;
}

// Walks toward the player, stopping short so the slam has room to land.
function* approach(boss: EntityId, length: Ticks, speed: number): Script {
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
function* strafe(boss: EntityId, length: Ticks, speed: number, dir: 1 | -1): Script {
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

function startSlam(boss: EntityId, x: number, z: number, def: SlamDef): void {
  Slam.timer[boss] = Slam.windup[boss] = def.windup;
  Slam.radius[boss] = def.radius;
  Slam.dmg[boss] = def.dmg;
  Slam.slowFor[boss] = def.slowFor;
  Slam.x[boss] = x;
  Slam.z[boss] = z;
  add(boss, C.Slam);
}

// The telegraph is the gameplay: slamSystem lands the hit when the timer runs out.
function* slam(boss: EntityId, def: SlamDef): Script {
  yield* begin(boss, Action.Slam);
  stop(boss);
  startSlam(boss, Transform.x[boss], Transform.z[boss], def);
  yield* waitTicks(def.windup);
  finish(boss);
}

// A deeper boss's bullets are a little faster: half its extra pace, so patterns
// stay readable while the gaps between them shrink.
function shoot(boss: EntityId, angle: number, speed: number): void {
  spawnProjectile(
    Transform.x[boss], Transform.z[boss], Math.cos(angle), Math.sin(angle), bulletSpeed(boss, speed),
    TeamId.Enemy, toHandle(boss), ENEMY_BULLET_DMG, ENEMY_BULLET_LIFE, ShapeKind.EnemyBullet,
  );
}

function bulletSpeed(boss: EntityId, speed: number): number {
  const pace = BossPace.pace[boss] > 0 ? BossPace.pace[boss] : 1;
  return speed * (1 + (pace - 1) / 2);
}

// A narrow fan aimed at the player: the answer to keeping your distance.
function fan(boss: EntityId, count: number, spread: number): void {
  const p = findPlayer();
  if (p === -1) return;
  const at = Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
  for (let i = 0; i < count; i++) shoot(boss, at + (i - (count - 1) / 2) * spread, AIMED_SPEED);
}

function* cone(boss: EntityId, volleys: number, count: number, spread: number, windup: Ticks = CONE_WINDUP): Script {
  yield* begin(boss, Action.Cone);
  stop(boss);
  BossAction.windup[boss] = windup;
  yield* waitTicks(windup);
  for (let v = 0; v < volleys; v++) {
    fan(boss, count, spread);
    if (v < volleys - 1) yield* waitTicks(CONE_VOLLEY_GAP);
  }
  finish(boss);
}

function* burst(boss: EntityId, count: number, offset: number, windup: Ticks = BURST_WINDUP): Script {
  yield* begin(boss, Action.Burst);
  stop(boss);
  BossAction.windup[boss] = windup;
  yield* waitTicks(windup);
  for (let i = 0; i < count; i++) shoot(boss, offset + (i / count) * Math.PI * 2, BURST_SPEED);
  finish(boss);
}

// The gap ring: a dense ring of bullets with RING_GAPS evenly spaced gaps. The
// floor shows the next wave's gaps (Pattern), and each wave turns them by RING_TURN.
// A wave is still flying when the next one fires, so the turn is small enough that
// every wave in the air at once shares a safe spot: you drift with the gaps
// instead of outrunning them.
export const RING_BULLETS = 48;
export const RING_GAPS = 3;
export const RING_GAP_HALF = 0.27;
export const RING_TURN = 0.14;
export const RING_SPEED = 9;

// The hand-made bosses' ring, spiral and storm, as the same data a generated
// boss's are made of, so both run through one script each.
export const RING: RingDef = {
  waves: 3, gaps: RING_GAPS, gapHalf: RING_GAP_HALF, turn: RING_TURN, speed: RING_SPEED,
  waveGap: RING_WAVE_GAP, windup: RING_WINDUP, bullets: RING_BULLETS,
};

function inGap(angle: number, gapAt: number, half: number, gaps: number): boolean {
  for (let k = 0; k < gaps; k++) {
    const gap = gapAt + (k * 2 * Math.PI) / gaps;
    if (Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap))) < half) return true;
  }
  return false;
}

function ringWave(boss: EntityId, gapAt: number, def: RingDef): void {
  for (let i = 0; i < def.bullets; i++) {
    const a = gapAt + (i / def.bullets) * Math.PI * 2;
    if (!inGap(a, gapAt, def.gapHalf, def.gaps)) shoot(boss, a, def.speed);
  }
}

// Shows a ring's gaps on the floor: written before the wave, from the same number.
function showGaps(boss: EntityId, gapAt: number, def: RingDef): void {
  Pattern.gapAt[boss] = gapAt;
  Pattern.gapHalf[boss] = def.gapHalf;
  Pattern.gaps[boss] = def.gaps;
}

export function* ring(boss: EntityId, waves: number, gapAt: number, dir: 1 | -1): Script {
  yield* ringOf(boss, waves === RING.waves ? RING : { ...RING, waves }, gapAt, dir);
}

function* ringOf(boss: EntityId, def: RingDef, gapAt: number, dir: 1 | -1): Script {
  yield* begin(boss, Action.Ring);
  stop(boss);
  showGaps(boss, gapAt, def);
  BossAction.windup[boss] = def.windup;
  yield* waitTicks(def.windup);
  for (let w = 0; w < def.waves; w++) {
    ringWave(boss, Pattern.gapAt[boss], def);
    if (w === def.waves - 1) break;
    // Shown at once, so the telegraph always says where the next wave's gaps are.
    Pattern.gapAt[boss] += def.turn * dir;
    yield* waitTicks(def.waveGap);
  }
  finish(boss);
}

// Three arms turning slowly: the lanes between them are safe if you walk round
// with them, and an arm is thin enough to dodge through.
export const SPIRAL_ARMS = 3;
const SPIRAL: SpiralDef = {
  arms: SPIRAL_ARMS, step: 0.06, every: ticks(4), speed: 10, length: SPIRAL_LENGTH, windup: SPIRAL_WINDUP,
};

function* spiral(boss: EntityId, startAt: number, dir: 1 | -1): Script {
  yield* spiralOf(boss, SPIRAL, startAt, dir);
}

function* spiralOf(boss: EntityId, def: SpiralDef, startAt: number, dir: 1 | -1): Script {
  yield* begin(boss, Action.Spiral);
  stop(boss);
  Pattern.gapAt[boss] = startAt;
  Pattern.gapHalf[boss] = 0;
  Pattern.arms[boss] = def.arms;
  BossAction.windup[boss] = def.windup;
  yield* waitTicks(def.windup);
  let at = startAt;
  for (let t = 0; t < def.length; t += def.every) {
    for (let arm = 0; arm < def.arms; arm++) shoot(boss, at + (arm * 2 * Math.PI) / def.arms, def.speed);
    at += def.step * dir;
    Pattern.gapAt[boss] = at;
    yield* waitTicks(def.every);
  }
  finish(boss);
}

// The storm, the final exam's one new attack: two spiral arms turning while gap
// rings go out through them. One action, so "one attack at a time" still holds;
// the floor shows each ring's gaps, and an arm crossing a gap is dodged through.
// A generated boss's combo is the same action with its own ring and arms.
const STORM_SPIRAL: SpiralDef = { ...SPIRAL, arms: 2, windup: STORM_WINDUP };

function* storm(boss: EntityId, gapAt: number, dir: 1 | -1): Script {
  yield* fused(boss, Action.Storm, RING, STORM_SPIRAL, STORM_LENGTH, gapAt, dir);
}

function* fused(
  boss: EntityId, kind: typeof Action.Storm | typeof Action.Combo, ringDef: RingDef, spiralDef: SpiralDef, length: Ticks,
  gapAt: number, dir: 1 | -1,
): Script {
  yield* begin(boss, kind);
  stop(boss);
  showGaps(boss, gapAt, ringDef);
  const windup = Math.min(ringDef.windup, spiralDef.windup);
  BossAction.windup[boss] = windup;
  yield* waitTicks(ticks(windup));
  let arm = gapAt + Math.PI / 2;
  let sinceRing: number = ringDef.waveGap;
  for (let t = 0; t < length; t += spiralDef.every) {
    for (let k = 0; k < spiralDef.arms; k++) shoot(boss, arm + (k * 2 * Math.PI) / spiralDef.arms, spiralDef.speed);
    arm += spiralDef.step * dir;
    sinceRing += spiralDef.every;
    if (sinceRing >= ringDef.waveGap) {
      ringWave(boss, Pattern.gapAt[boss], ringDef);
      Pattern.gapAt[boss] += ringDef.turn * dir;
      sinceRing = 0;
    }
    yield* waitTicks(spiralDef.every);
  }
  finish(boss);
}

function angleToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.atan2(Transform.z[p] - Transform.z[boss], Transform.x[p] - Transform.x[boss]);
}

// Where a jump comes down: on the player, or away from them. Chosen at take-off
// and shown at once, so the player always gets the full flight time to react.
function landingSpot(boss: EntityId, mode: JumpMode, out: { x: number; z: number }): void {
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

const spot = { x: 0, z: 0 };
// 'toward' lands a set distance toward the player rather than on them: the
// entrance drop announces the fight without opening it with a hit.
type JumpMode = 'at' | 'away' | 'toward';
const DROP_DISTANCE = 6;

// Crouch, fly, land. The landing is an ordinary slam centred on the landing
// spot, so it shares the slam's telegraph, damage and slow.
function* jump(boss: EntityId, mode: JumpMode): Script {
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

const ROAR_PUSH_RADIUS = 7;
const ROAR_PUSH_SPEED = 9;
const ROAR_PUSH = ticks(15);

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
  Knockback.until[p] = after(ROAR_PUSH);
}

// The cutscene that opens phase 2. Rears up first so the player sees it coming;
// the shake and shove land on the roar itself. It can't be burst down mid-roar.
function* roar(boss: EntityId): Script {
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
function* dropIn(boss: EntityId): Script {
  startCutscene(plus(JUMP_CROUCH, JUMP_AIR));
  yield* jump(boss, 'toward');
}

function shouldEvade(boss: EntityId): boolean {
  if (world.tick < Pressure.evadeReadyAt[boss]) return false;
  if (shareOf(Pressure.recentLoss[boss], Health.max[boss]) <= EVADE_LOSS) return false;
  Pressure.evadeReadyAt[boss] = after(EVADE_COOLDOWN);
  return true;
}

function distanceToPlayer(boss: EntityId): number {
  const p = findPlayer();
  return p === -1 ? 0 : Math.hypot(Transform.x[p] - Transform.x[boss], Transform.z[p] - Transform.z[boss]);
}

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

// ---- Procedural bosses (Stage C) ----
// Their moves come from planFor (bosses/generate.ts); these are the scripts
// that play them. The charge is the Lancer's, the sweep and the orbs the
// Sentinel's, but any kit can draw them.

// A charge or a sweep's line, as the floor shows it and hazardSystem reads it.
function showLine(boss: EntityId, angle: number, length: number, width: number, arc: number, dmg: Hp): void {
  Line.angle[boss] = angle;
  Line.length[boss] = length;
  Line.width[boss] = width;
  Line.arc[boss] = arc;
  Line.dmg[boss] = dmg;
  Line.state[boss] = LineState.Telegraph;
}

// How far a charge from here, this way, can go before the wall.
function laneLength(boss: EntityId, angle: number, most: number): number {
  const edge = Arena.half - Collider.radius[boss] - 0.3;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let length = most;
  if (dx !== 0) length = Math.min(length, ((dx > 0 ? edge : -edge) - Transform.x[boss]) / dx);
  if (dz !== 0) length = Math.min(length, ((dz > 0 ? edge : -edge) - Transform.z[boss]) / dz);
  return Math.max(0, length);
}

// Touching a pillar: the charge ends there, and the boss is stunned.
function againstStone(boss: EntityId): boolean {
  const n = query(helperBuf, PILLARS, C.Dead);
  for (let i = 0; i < n; i++) {
    const s = entityAt(helperBuf, i);
    if (s === boss) continue;
    const reach = Collider.radius[s] + Collider.radius[boss] + 0.15;
    const dx = Transform.x[s] - Transform.x[boss];
    const dz = Transform.z[s] - Transform.z[boss];
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  return false;
}

// The Lancer's charge: a lane shown on the floor at the player for the whole
// windup, then a straight run down it. Hitting the player is hazardSystem's
// (once a charge); hitting a pillar stops it dead and stuns it, which is the
// opening a charge gives you.
type ChargeMove = Extract<Move, { kind: 'charge' }>;
function* charge(boss: EntityId, move: ChargeMove): Script {
  yield* begin(boss, Action.Charge);
  stop(boss);
  const angle = angleToPlayer(boss);
  showLine(boss, angle, laneLength(boss, angle, move.length), move.width, 0, move.dmg);
  BossAction.windup[boss] = move.windup;
  yield* waitTicks(move.windup);
  Line.state[boss] = LineState.Live;
  const run = inTicks(seconds(Line.length[boss] / move.speed)) + 1;
  let stunned = false;
  for (let t = 0; t < run; t++) {
    if (againstStone(boss)) { stunned = true; break; }
    Velocity.x[boss] = Math.cos(angle) * move.speed;
    Velocity.z[boss] = Math.sin(angle) * move.speed;
    yield;
  }
  stop(boss);
  if (stunned) {
    Line.state[boss] = LineState.Stunned;
    yield* waitTicks(move.stun);
  }
  Line.state[boss] = LineState.Idle;
  finish(boss);
}

// The Sentinel's beam: the arc it will sweep is shown for the windup, centred
// on the player, then the beam turns across it once. Pillars block it, so
// cover works; a beam far enough out passes faster than a dodge lasts.
type SweepMove = Extract<Move, { kind: 'sweep' }>;
function* sweep(boss: EntityId, move: SweepMove, dir: 1 | -1): Script {
  yield* begin(boss, Action.Sweep);
  stop(boss);
  const arc = move.arc * dir;
  showLine(boss, angleToPlayer(boss) - arc / 2, Arena.half * 3, move.width, arc, move.dmg);
  BossAction.windup[boss] = move.windup;
  yield* waitTicks(move.windup);
  Line.state[boss] = LineState.Live;
  const perTick = move.turnRate * inSeconds(ticks(1)) * dir;
  const steps = Math.ceil(move.arc / Math.abs(perTick));
  for (let t = 0; t < steps; t++) {
    Line.angle[boss] += perTick;
    yield;
  }
  Line.state[boss] = LineState.Idle;
  finish(boss);
}

// Slow homing orbs in a fan at the player: they turn after you, but you walk
// faster than they fly, and a pillar stops them.
function* orbs(boss: EntityId, def: OrbsDef): Script {
  yield* begin(boss, Action.Orbs);
  stop(boss);
  BossAction.windup[boss] = def.windup;
  yield* waitTicks(def.windup);
  const at = angleToPlayer(boss);
  for (let k = 0; k < def.count; k++) {
    const a = at + (k - (def.count - 1) / 2) * 0.45;
    const orb = spawnProjectile(
      Transform.x[boss], Transform.z[boss], Math.cos(a), Math.sin(a), bulletSpeed(boss, def.speed),
      TeamId.Enemy, toHandle(boss), ORB_DMG, def.life, ShapeKind.Orb,
    );
    add(orb, C.Homing);
    Homing.turn[orb] = def.turn;
  }
  finish(boss);
}

// One generated move, by its script. The hand-made scripts' own choices
// (where a ring's gap starts, which way things turn) are made the same way here.
function* perform(boss: EntityId, move: Move, dir: 1 | -1): Script {
  switch (move.kind) {
    case 'slam': yield* slam(boss, { windup: move.windup, radius: move.radius, dmg: move.dmg, slowFor: ticks(0) }); return;
    case 'jump': yield* jump(boss, 'at'); return;
    case 'cone': yield* cone(boss, move.volleys, move.count, move.spread, move.windup); return;
    case 'burst': yield* burst(boss, move.count, angleToPlayer(boss), move.windup); return;
    case 'ring': yield* ringOf(boss, move.ring, angleToPlayer(boss), dir); return;
    case 'spiral': yield* spiralOf(boss, move.spiral, angleToPlayer(boss) + Math.PI / 3, dir); return;
    case 'charge': yield* charge(boss, move); return;
    case 'sweep': yield* sweep(boss, move, dir); return;
    case 'orbs': yield* orbs(boss, move.orbs); return;
    case 'combo': yield* fused(boss, Action.Combo, move.ring, move.spiral, move.length, angleToPlayer(boss), dir); return;
    default: return assertNeverMove(move);
  }
}

function assertNeverMove(move: never): never {
  throw new Error(`no script for move ${JSON.stringify(move)}`);
}

// Every phase of a procedural boss: its plan regenerated from the kit (once,
// as the phase starts), the roar that opens each phase after the first, then
// its kit's moves in turn, starting where the kit says. Between moves the body
// decides: the Colossus walks you down, the Lancer circles, the Sentinel holds.
export function* procedural(boss: EntityId): Script {
  const plan = planFor(BossGen.kit[boss], BossGen.depth[boss], BossGen.body[boss] as BodyKind);
  const phase = Math.min(BossPhase.phase[boss], plan.phases.length);
  const moves = plan.phases[phase - 1].moves;
  const body = BossGen.body[boss];
  if (phase === 1 && Jump.fromHeight[boss] > 0) yield* dropIn(boss);
  if (phase > 1) yield* roar(boss);
  let turn = BossGen.kit[boss] % moves.length;
  let dir: 1 | -1 = 1;
  for (;;) {
    // The Sentinel never jumps, so it can't evade either: it stands its ground.
    if (body !== Body.Sentinel && shouldEvade(boss)) yield* jump(boss, 'away');
    if (body === Body.Colossus) yield* approach(boss, ticks(45), 3);
    else if (body === Body.Lancer) yield* strafe(boss, ticks(16), 4.5, dir);
    else yield* waitTicks(ticks(10));
    const move = moves[turn++ % moves.length];
    // A slam from range would land on nothing; the Colossus walks on and tries the next move.
    if (move.kind === 'slam' && distanceToPlayer(boss) > SLAM_RANGE) continue;
    yield* perform(boss, move, dir);
    dir = dir === 1 ? -1 : 1;
  }
}
