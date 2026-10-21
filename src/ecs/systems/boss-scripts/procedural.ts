// Procedural bosses (Stage C): their moves come from planFor (bosses/generate.ts);
// these are the scripts that play them. The charge is the Lancer's, the sweep
// and the orbs the Sentinel's, but any kit can draw them.
import { Body, planFor } from '../../bosses/generate';
import type { BodyKind, Move, OrbsDef } from '../../bosses/generate';
import { Arena, BossGen, BossPhase, C, Collider, Homing, Jump, Line, LineState, ShapeKind, TeamId, Transform, Velocity } from '../../components';
import { helperBuf } from '../../core/buffers';
import { waitTicks } from '../../core/script';
import type { Script } from '../../core/script';
import { inSeconds, inTicks, seconds, ticks } from '../../core/units';
import type { Hp } from '../../core/units';
import { add, entityAt, query, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnProjectile } from '../../prefabs';
import { Action, begin, finish } from '../boss-actions';
import { ORB_DMG, PILLARS, SLAM_RANGE, angleToPlayer, approach, bulletSpeed, burst, cone, distanceToPlayer, dropIn, jump, roar, shouldEvade, slam, stop, strafe } from './moves';
import { fused, ringOf, spiralOf } from './patterns';

// A charge or a sweep's line, as the floor shows it and hazardSystem reads it.
export function showLine(boss: EntityId, angle: number, length: number, width: number, arc: number, dmg: Hp): void {
  Line.angle[boss] = angle;
  Line.length[boss] = length;
  Line.width[boss] = width;
  Line.arc[boss] = arc;
  Line.dmg[boss] = dmg;
  Line.state[boss] = LineState.Telegraph;
}

// How far a charge from here, this way, can go before the wall.
export function laneLength(boss: EntityId, angle: number, most: number): number {
  const edge = Arena.half - Collider.radius[boss] - 0.3;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let length = most;
  if (dx !== 0) length = Math.min(length, ((dx > 0 ? edge : -edge) - Transform.x[boss]) / dx);
  if (dz !== 0) length = Math.min(length, ((dz > 0 ? edge : -edge) - Transform.z[boss]) / dz);
  return Math.max(0, length);
}

// Touching a pillar: the charge ends there, and the boss is stunned.
export function againstStone(boss: EntityId): boolean {
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
export type ChargeMove = Extract<Move, { kind: 'charge' }>;

export function* charge(boss: EntityId, move: ChargeMove): Script {
  yield* begin(boss, Action.Charge, move.windup);
  stop(boss);
  const angle = angleToPlayer(boss);
  showLine(boss, angle, laneLength(boss, angle, move.length), move.width, 0, move.dmg);
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
export type SweepMove = Extract<Move, { kind: 'sweep' }>;

export function* sweep(boss: EntityId, move: SweepMove, dir: 1 | -1): Script {
  yield* begin(boss, Action.Sweep, move.windup);
  stop(boss);
  const arc = move.arc * dir;
  showLine(boss, angleToPlayer(boss) - arc / 2, Arena.half * 3, move.width, arc, move.dmg);
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
export function* orbs(boss: EntityId, def: OrbsDef): Script {
  yield* begin(boss, Action.Orbs, def.windup);
  stop(boss);
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
export function* perform(boss: EntityId, move: Move, dir: 1 | -1): Script {
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

export function assertNeverMove(move: never): never {
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
