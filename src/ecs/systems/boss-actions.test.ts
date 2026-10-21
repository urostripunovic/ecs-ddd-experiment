import { describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  BossAction, BossPhase, C, Health, Knockback, RunStatus, Pressure, resetRunState, Shake, Slam, TeamId,
  Transform,
} from '../components';
import { buf } from '../core/buffers';
import { hp, inSeconds, seconds, ticks } from '../core/units';
import { has, query, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { FINAL, UNCHAINED, WARDEN, type BossDef } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnProjectile } from '../prefabs';
import { Action, chainGap, DEFAULT_GAP, paceGap, ROAR_HOLD, ROAR_REAR, type ActionKind } from './boss-actions';
import { controlsLocked } from './cutscene';
import { hurt } from './damage';
import { bossPhaseSystem, bossThresholdSystem, resetScripts, slamSystem } from './boss';
import { outbox } from '../core/outbox';
import { bodyCollisionSystem, projectileCollisionSystem } from './collision';
import { projectileSystem } from './combat';
import { movementSystem, snapshotSystem } from './motion';

const DT = inSeconds(ticks(1));
type Chain = { from: ActionKind; to: ActionKind; gap: number };

let p: EntityId;
let b: EntityId;

function arena(phase: number, def: BossDef = WARDEN): void {
  resetWorld();
  resetRunState();
  resetScripts();
  RunViewWritable.status = RunStatus.Fighting;
  for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
  p = spawnPlayer(0, 12);
  b = spawnBoss({ ...def, hp: hp(100_000) }, 0, -8); // never dies, so the choreography keeps running
  BossPhase.phase[b] = phase;
  Pressure.evadeReadyAt[b] = 1e9; // evading is tested on its own below
}

// Runs the boss for a while, recording every action start and every tick spent airborne.
function run(ticks: number, playerKeepsAway: boolean) {
  const chains: Chain[] = [];
  let shotsWhileAirborne = 0;
  let lastStart = -1;
  for (let i = 0; i < ticks; i++) {
    if (playerKeepsAway) {
      // Stays 10 m off so the boss keeps choosing its ranged options.
      Transform.x[p] = Math.max(-17, Math.min(17, Transform.x[b]));
      Transform.z[p] = Transform.z[b] > 5 ? Transform.z[b] - 10 : Transform.z[b] + 10;
    }
    const shotsBefore = query(buf, C.Projectile);
    snapshotSystem();
    bossPhaseSystem();
    movementSystem(DT);
    bodyCollisionSystem();
    // Bullets leave at the walls, as in the game; without it a long run fills every slot.
    projectileCollisionSystem();
    slamSystem();
    if (has(b, C.Airborne) && query(buf, C.Projectile) > shotsBefore) shotsWhileAirborne++;
    if (BossAction.kind[b] !== Action.Idle && BossAction.startedAt[b] !== lastStart) {
      lastStart = BossAction.startedAt[b];
      if (BossAction.lastKind[b] !== Action.Idle) {
        chains.push({
          from: BossAction.lastKind[b] as ActionKind,
          to: BossAction.kind[b] as ActionKind,
          gap: BossAction.startedAt[b] - BossAction.lastEnd[b],
        });
      }
    }
    world.tick++;
  }
  return { chains, shotsWhileAirborne };
}

describe('spawning a boss', () => {
  it('starts its pressure mark at its own hp, and holds off evading for its grace period', () => {
    resetWorld();
    resetRunState();
    world.tick = 500;
    const e = spawnBoss({ ...WARDEN, hp: hp(345) }, 0, 0);
    expect(Health.hp[e]).toBe(345);
    expect(Pressure.hpMark[e]).toBe(345);
    expect(Pressure.evadeReadyAt[e]).toBe(500 + WARDEN.evadeGrace);
  });
});

describe('phases', () => {
  it('phase 2 starts at half hp, once, without asking the rules', () => {
    arena(1);
    Health.hp[b] = Health.max[b] * 0.51;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(1);
    Health.hp[b] = Health.max[b] * 0.5;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(2);
    expect(outbox.count).toBe(0);
    Health.hp[b] = Health.max[b];
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(2); // healing never takes it back
  });
});

describe('chain gaps', () => {
  it('phase 1 chains nothing: every action waits the default gap', () => {
    for (const from of [Action.Slam, Action.Cone, Action.Burst, Action.Jump] as ActionKind[]) {
      for (const to of [Action.Slam, Action.Cone, Action.Burst, Action.Jump] as ActionKind[]) {
        expect(chainGap(1, from, to)).toBe(DEFAULT_GAP);
      }
    }
  });

  it('phase 2 lets a shot roll into a jump, but never a landing into a shot', () => {
    expect(chainGap(2, Action.Cone, Action.Jump)).toBe(1);
    expect(chainGap(2, Action.Burst, Action.Jump)).toBe(1);
    expect(chainGap(2, Action.Jump, Action.Cone)).toBe(DEFAULT_GAP);
    expect(chainGap(2, Action.Jump, Action.Burst)).toBe(DEFAULT_GAP);
    expect(chainGap(2, Action.Cone, Action.Burst)).toBe(DEFAULT_GAP);
  });
});

describe('boss choreography', () => {
  for (const phase of [1, 2]) {
    it(`phase ${phase}: every action respects its chain gap, and nothing fires mid-air`, () => {
      arena(phase);
      const { chains, shotsWhileAirborne } = run(4000, true);
      expect(chains.length).toBeGreaterThan(10);
      for (const c of chains) expect(c.gap).toBeGreaterThanOrEqual(chainGap(phase, c.from, c.to));
      expect(shotsWhileAirborne).toBe(0);
      expect(chains.some((c) => c.to === Action.Jump)).toBe(true);
    });
  }

  it('phase 2 actually uses its one chain: a cone straight into a jump', () => {
    arena(2);
    const { chains } = run(4000, true);
    expect(chains.some((c) => c.from === Action.Cone && c.to === Action.Jump && c.gap === 1)).toBe(true);
  });

  it('bullets pass under the boss while it is airborne', () => {
    arena(1);
    // Run until it takes off (it jumps at range on its second ranged turn).
    for (let i = 0; i < 4000 && !has(b, C.Airborne); i++) run(1, true);
    expect(has(b, C.Airborne)).toBe(true);
    const before = Health.hp[b];
    const bullet = spawnProjectile(Transform.x[b], Transform.z[b], 0, 1, 0, TeamId.Player, toHandle(p), hp(25), seconds(1), 0);
    projectileSystem(DT);
    expect(Health.hp[b]).toBe(before);
    expect(world.inUse[bullet]).toBe(1); // flew on, not spent on the boss
  });
});

describe('pace', () => {
  it('a faster boss waits less between attacks, but never under one tick', () => {
    arena(1, { ...UNCHAINED, pace: 2 });
    expect(paceGap(b, ticks(10))).toBe(5);
    expect(paceGap(b, ticks(1))).toBe(1);
    arena(1, UNCHAINED);
    expect(paceGap(b, ticks(10))).toBe(10);
  });
});

describe('the Unchained', () => {
  for (const phase of [1, 2]) {
    it(`phase ${phase}: every action respects its own chain gaps, and nothing fires mid-air`, () => {
      arena(phase, UNCHAINED);
      const { chains, shotsWhileAirborne } = run(4000, true);
      expect(chains.length).toBeGreaterThan(10);
      for (const c of chains) expect(c.gap).toBeGreaterThanOrEqual(chainGap(phase, c.from, c.to, UNCHAINED.style));
      expect(shotsWhileAirborne).toBe(0);
    });
  }

  it('fights with gap rings in phase 1, and adds the spiral in phase 2', () => {
    arena(1, UNCHAINED);
    expect(run(4000, true).chains.some((c) => c.to === Action.Ring)).toBe(true);
    arena(2, UNCHAINED);
    const { chains } = run(4000, true);
    expect(chains.some((c) => c.to === Action.Spiral)).toBe(true);
    expect(chains.some((c) => c.to === Action.Ring)).toBe(true);
  });

  it('waits less between attacks than the Warden', () => {
    expect(chainGap(1, Action.Slam, Action.Cone, UNCHAINED.style)).toBeLessThan(chainGap(1, Action.Slam, Action.Cone));
  });
});

describe('the final boss', () => {
  it('moves through three phases: at two thirds and one third of its hp, only forward', () => {
    arena(1, FINAL);
    Health.hp[b] = Health.max[b] * 0.67;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(1);
    Health.hp[b] = Health.max[b] * 0.66;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(2);
    Health.hp[b] = Health.max[b] * 0.33;
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(3);
    Health.hp[b] = Health.max[b];
    bossThresholdSystem();
    expect(BossPhase.phase[b]).toBe(3);
  });

  for (const phase of [1, 2, 3]) {
    it(`phase ${phase}: every action respects its chain gaps, and nothing fires mid-air`, () => {
      arena(phase, FINAL);
      const { chains, shotsWhileAirborne } = run(4000, true);
      expect(chains.length).toBeGreaterThan(10);
      for (const c of chains) expect(c.gap).toBeGreaterThanOrEqual(chainGap(phase, c.from, c.to, FINAL.style));
      expect(shotsWhileAirborne).toBe(0);
    });
  }

  it('teaches one lesson per phase: the Warden\'s moves, then rings and the spiral, then the storm', () => {
    arena(1, FINAL);
    const one = run(4000, true).chains;
    expect(one.some((c) => c.to === Action.Slam || c.to === Action.Jump)).toBe(true);
    expect(one.some((c) => c.to === Action.Ring || c.to === Action.Spiral || c.to === Action.Storm)).toBe(false);
    arena(2, FINAL);
    const two = run(4000, true).chains;
    expect(two.some((c) => c.to === Action.Ring)).toBe(true);
    expect(two.some((c) => c.to === Action.Spiral)).toBe(true);
    arena(3, FINAL);
    expect(run(4000, true).chains.some((c) => c.to === Action.Storm)).toBe(true);
  });

  it('opens phases 2 and 3 with a roar', () => {
    for (const phase of [2, 3]) {
      arena(phase, FINAL);
      run(ROAR_REAR + 2, false);
      expect(BossAction.kind[b]).toBe(Action.Roar);
    }
  });
});

describe('roar', () => {
  it('phase 2 opens with a roar: controls locked, boss invulnerable, screen shaking, player shoved', () => {
    arena(2);
    Transform.z[p] = -4; // within shoving range of the boss at z = -8
    run(ROAR_REAR + 2, false);

    expect(BossAction.kind[b]).toBe(Action.Roar);
    expect(controlsLocked()).toBe(true);
    expect(has(b, C.Invulnerable)).toBe(true);
    expect(Shake.trauma).toBeGreaterThan(0.9);
    expect(Knockback.until[p]).toBeGreaterThan(world.tick);
    expect(Knockback.z[p]).toBeGreaterThan(0); // away from the boss

    const before = Health.hp[b];
    hurt(b, 100, toHandle(p));
    expect(Health.hp[b]).toBe(before);

    run(ROAR_HOLD, false);
    expect(controlsLocked()).toBe(false);
    expect(has(b, C.Invulnerable)).toBe(false);
  });
});

describe('evading', () => {
  it('heavy damage makes it jump away, but only once per cooldown', () => {
    arena(1);
    Pressure.evadeReadyAt[b] = 0;
    let awayJumps = 0;
    let wasAirborne = false;
    for (let i = 0; i < 6 * 60; i++) {
      Health.hp[b] -= Health.max[b] * 0.002; // 12% of max hp a second, double the threshold, the whole time
      run(1, false);
      const airborne = has(b, C.Airborne);
      if (airborne && !wasAirborne) {
        // The landing spot (the slam centre) is farther from the player than the take-off point.
        const from = Math.hypot(Transform.x[b] - Transform.x[p], Transform.z[b] - Transform.z[p]);
        const to = Math.hypot(Slam.x[b] - Transform.x[p], Slam.z[b] - Transform.z[p]);
        if (to > from + 3) awayJumps++;
      }
      wasAirborne = airborne;
    }
    expect(awayJumps).toBe(1);
  });
});
