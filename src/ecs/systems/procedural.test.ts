// Procedural bosses in the simulation: the new moves do what they promise,
// and generated bosses keep the choreography's rules over long fights.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  BossAction, BossGen, BossPhase, C, GodMode, Health, Homing, Line, LineState, Pressure, resetRunState, RunStatus, Transform, Velocity,
} from '../components';
import { buf } from '../core/buffers';
import { hp, inSeconds, inTicks, seconds, ticks, type Ticks } from '../core/units';
import { add, despawn, entityAt, has, query, resetWorld, world, type EntityId } from '../core/world';
import { arenaFor, COLOSSUS_HALL, kitFor, LANCER_HALL, PILLAR_RADIUS, SENTINEL_HALL, type ArenaLayout } from '../arenas';
import { BODY_DEFS, type BossDef } from '../bosses/defs';
import { Body, planFor, type BodyKind } from '../bosses/generate';
import { spawnBoss, spawnPillar, spawnPlayer, spawnProjectile } from '../prefabs';
import { Action, chainGap, paceGap, type ActionKind } from './boss-actions';
import { bossThresholdSystem, resetScripts } from './boss';
import { homingSystem } from './hazards';
import { PLAYER_SPEED } from './motion';
import { stepper } from '../tick-order';

const DT = inSeconds(ticks(1));
let p: EntityId;
let b: EntityId;

// A boss of this body, at this depth, generated from this kit, in its hall.
function hall(layout: ArenaLayout, kit: number, depth: number, phase = 1, def?: BossDef): void {
  resetWorld();
  resetRunState();
  resetScripts();
  RunViewWritable.status = RunStatus.Fighting;
  for (const [x, z] of layout.pillars) spawnPillar(x, z, PILLAR_RADIUS);
  p = spawnPlayer(layout.playerStart[0], layout.playerStart[1]);
  const base = def ?? layout.boss;
  b = spawnBoss({ ...base, hp: hp(100_000), kit, depth }, layout.bossStart[0], layout.bossStart[1]);
  BossPhase.phase[b] = phase;
  Pressure.evadeReadyAt[b] = 1e9;
}

const step = stepper(['snapshotSystem', 'bossPhaseSystem', 'homingSystem', 'movementSystem', 'bodyCollisionSystem', 'projectileCollisionSystem', 'projectileSystem', 'slamSystem', 'hazardSystem']);

// Runs until the boss starts this action, or gives up.
function untilAction(kind: ActionKind, most = 6000): boolean {
  for (let i = 0; i < most; i++) {
    if (BossAction.kind[b] === kind) return true;
    step();
  }
  return false;
}

// A kit whose phase 1 has this move, for this body.
function kitWith(body: BodyKind, kind: string, depth = 2): number {
  for (let kit = 1; kit < 500; kit++) if (planFor(kit, depth, body).phases[0].moves.some((m) => m.kind === kind)) return kit;
  throw new Error(`no kit with ${kind}`);
}

beforeEach(() => {
  resetWorld();
  resetRunState();
});

describe('the charge', () => {
  it('shows its lane for the whole windup, then runs down it and hits you once', () => {
    hall(LANCER_HALL, kitWith(Body.Lancer, 'charge'), 2);
    // Stand still in the open, straight ahead of it, and keep standing there.
    Transform.x[p] = 0; Transform.z[p] = 4;
    expect(untilAction(Action.Charge)).toBe(true);
    // Whatever earlier moves did, this charge starts on a fresh player.
    Health.hp[p] = 100;
    expect(Line.state[b]).toBe(LineState.Telegraph);
    let shownFor = 0;
    while (Line.state[b] === LineState.Telegraph) { shownFor++; Transform.x[p] = 0; Transform.z[p] = 4; step(); }
    expect(shownFor).toBeGreaterThanOrEqual(24);
    for (let i = 0; i < 90 && BossAction.kind[b] === Action.Charge; i++) step();
    expect(100 - Health.hp[p]).toBe(Line.dmg[b]);
  });

  it('stops dead and is stunned when it runs into a pillar', () => {
    hall(LANCER_HALL, kitWith(Body.Lancer, 'charge'), 2);
    // Keep the pillar at (0, 10) between you and the boss, wherever it goes:
    // every charge aims at you and comes into stone first.
    const stand = () => {
      const dx = 0 - Transform.x[b];
      const dz = 10 - Transform.z[b];
      const d = Math.hypot(dx, dz) || 1;
      Transform.x[p] = (dx / d) * 3.2;
      Transform.z[p] = 10 + (dz / d) * 3.2;
      Health.hp[p] = 100;
    };
    let stunned = false;
    for (let i = 0; i < 6000 && !stunned; i++) { stand(); step(); stunned = Line.state[b] === LineState.Stunned; }
    expect(stunned).toBe(true);
    expect(Velocity.x[b]).toBe(0);
    expect(Velocity.z[b]).toBe(0);
    // Stunned, it does nothing for a while: a free opening.
    const at = world.tick;
    while (Line.state[b] === LineState.Stunned) step();
    expect(world.tick - at).toBeGreaterThan(60);
  });

  it('can be sidestepped: walking off the lane during the windup, it misses', () => {
    hall(LANCER_HALL, kitWith(Body.Lancer, 'charge'), 2);
    Transform.x[p] = 0; Transform.z[p] = 5;
    expect(untilAction(Action.Charge)).toBe(true);
    Health.hp[p] = 100;
    // Walk sideways at walking speed from the moment the lane shows.
    for (let i = 0; i < 200 && BossAction.kind[b] === Action.Charge; i++) {
      Transform.x[p] = Math.min(6, Transform.x[p] + PLAYER_SPEED * DT);
      step();
    }
    expect(Health.hp[p]).toBe(100);
  });
});

describe('the beam sweep', () => {
  const sweepKit = () => kitWith(Body.Sentinel, 'sweep');

  it('hits a player out in the open once per sweep', () => {
    hall(SENTINEL_HALL, sweepKit(), 2);
    const stand = () => { Transform.x[p] = 3; Transform.z[p] = 0; };
    stand();
    expect(untilAction(Action.Sweep)).toBe(true);
    Health.hp[p] = 100;
    for (let i = 0; i < 400 && BossAction.kind[b] === Action.Sweep; i++) { stand(); step(); }
    const dmg = Line.dmg[b];
    expect(100 - Health.hp[p]).toBeLessThanOrEqual(dmg);
    expect(100 - Health.hp[p]).toBeGreaterThan(0);
  });

  it('is blocked by cover: a pillar between you and it keeps you safe', () => {
    hall(SENTINEL_HALL, sweepKit(), 2);
    // Behind the pillar at (0, -7), on the far side from the boss at the centre.
    const stand = () => { Transform.x[p] = 0; Transform.z[p] = -9.5; };
    stand();
    expect(untilAction(Action.Sweep)).toBe(true);
    Health.hp[p] = 100;
    for (let i = 0; i < 400 && BossAction.kind[b] === Action.Sweep; i++) { stand(); step(); }
    expect(Health.hp[p]).toBe(100);
  });

  it('leaves part of the circle untouched, the arc it shows', () => {
    hall(SENTINEL_HALL, sweepKit(), 2);
    expect(untilAction(Action.Sweep)).toBe(true);
    expect(Math.abs(Line.arc[b])).toBeLessThanOrEqual(Math.PI * 1.5);
    const start = Line.angle[b];
    while (BossAction.kind[b] === Action.Sweep) step();
    expect(Math.abs(Line.angle[b] - start)).toBeCloseTo(Math.abs(Line.arc[b]), 1);
  });
});

describe('homing orbs', () => {
  it('turn after you, but a player walking away is never caught', () => {
    hall(SENTINEL_HALL, kitWith(Body.Sentinel, 'orbs'), 2);
    Transform.x[p] = 0; Transform.z[p] = 4;
    expect(untilAction(Action.Orbs)).toBe(true);
    while (BossAction.kind[b] === Action.Orbs) step();
    expect(query(buf, C.Homing)).toBeGreaterThan(0);
    // Only the orbs from here: the boss holds still and anything else in the air goes.
    GodMode.freezeBoss = true;
    const n = query(buf, C.Projectile);
    for (let i = n - 1; i >= 0; i--) if (!has(entityAt(buf, i), C.Homing)) despawn(entityAt(buf, i));
    Health.hp[p] = 100;
    // Walk straight away from the boss for two seconds, before the wall stops you.
    for (let i = 0; i < inTicks(seconds(2)); i++) {
      Transform.z[p] = Math.min(19, Transform.z[p] + PLAYER_SPEED * DT);
      Transform.x[p] = 0;
      step();
    }
    GodMode.freezeBoss = false;
    expect(Health.hp[p]).toBe(100);
  });

  it('steer toward the player', () => {
    hall(SENTINEL_HALL, 1, 2);
    const orb = spawnProjectile(0, 0, 1, 0, 4, 1, 0 as never, hp(15), seconds(5), 20);
    add(orb, C.Homing);
    Homing.turn[orb] = 1.5;
    Transform.x[p] = 0; Transform.z[p] = 10;
    const before = Math.atan2(Velocity.z[orb], Velocity.x[orb]);
    for (let i = 0; i < 30; i++) homingSystem();
    const after = Math.atan2(Velocity.z[orb], Velocity.x[orb]);
    expect(after).toBeGreaterThan(before);
    expect(Math.hypot(Velocity.x[orb], Velocity.z[orb])).toBeCloseTo(4, 5);
  });
});

describe('a procedural boss', () => {
  it('comes from the run: each drawn hall gets its kit and its name from the seed', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (let arena = 2; arena <= 8; arena++) {
        const planned = arenaFor(seed, arena, false);
        if (planned.boss.kit === 0) continue;
        expect(planned.boss.kit).toBe(kitFor(seed, arena));
        expect(planned.boss.depth).toBe(arena - 1);
        expect(planned.boss.name).toBe(planFor(planned.boss.kit, arena - 1, planned.boss.body as BodyKind).name);
      }
    }
  });

  it('moves to its next phase at the shares its plan gives, three phases from depth 3', () => {
    hall(COLOSSUS_HALL, 7, 5);
    expect(BossGen.phases[b]).toBe(3);
    Health.hp[b] = Health.max[b] * 0.65;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(2);
    Health.hp[b] = Health.max[b] * 0.32;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(3);
    hall(COLOSSUS_HALL, 7, 1);
    expect(BossGen.phases[b]).toBe(2);
  });

  const HALLS: readonly [ArenaLayout, BodyKind][] = [[COLOSSUS_HALL, Body.Colossus], [LANCER_HALL, Body.Lancer], [SENTINEL_HALL, Body.Sentinel]];
  for (const [layout, body] of HALLS) {
    for (const depth of [2, 6]) {
      it(`${BODY_DEFS[body].name}, depth ${depth}: over long fights in every phase, one action at a time, every gap kept, nothing fired mid-air`, () => {
        for (let kit = 1; kit <= 4; kit++) {
          const phases = planFor(kit, depth, body).phases.length;
          for (let phase = 1; phase <= phases; phase++) {
            hall(layout, kit, depth, phase, { ...layout.boss, pace: 1 + 0.08 * depth });
            const seen = longFight(ticks(2400));
            expect(seen.starts, `kit ${kit} phase ${phase}`).toBeGreaterThan(4);
            expect(seen.shotsWhileAirborne).toBe(0);
            for (const c of seen.chains) {
              expect(c.gap).toBeGreaterThanOrEqual(paceGap(b, chainGap(phase, c.from, c.to, layout.boss.style)));
              expect(c.gap).toBeGreaterThanOrEqual(1);
            }
          }
        }
      });
    }
  }
});

// Plays a fight with the player circling at a middle distance, and records
// every action start: the gap since the last ended, and shots while airborne.
function longFight(length: Ticks) {
  const chains: { from: ActionKind; to: ActionKind; gap: number }[] = [];
  let starts = 0;
  let shotsWhileAirborne = 0;
  let lastStart = -1;
  for (let i = 0; i < length; i++) {
    const a = i / 120;
    Transform.x[p] = Math.cos(a) * 7;
    Transform.z[p] = Math.sin(a) * 7;
    Health.hp[p] = 100;
    const shotsBefore = query(buf, C.Projectile);
    step();
    if (has(b, C.Airborne) && query(buf, C.Projectile) > shotsBefore) shotsWhileAirborne++;
    if (BossAction.kind[b] !== Action.Idle && BossAction.startedAt[b] !== lastStart) {
      lastStart = BossAction.startedAt[b];
      starts++;
      if (BossAction.lastKind[b] !== Action.Idle) {
        chains.push({
          from: BossAction.lastKind[b] as ActionKind, to: BossAction.kind[b] as ActionKind,
          gap: BossAction.startedAt[b] - BossAction.lastEnd[b],
        });
      }
    }
  }
  return { chains, starts, shotsWhileAirborne };
}
