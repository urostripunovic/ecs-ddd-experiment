import { beforeEach, describe, expect, it } from 'vitest';

import { ARENAS, PILLAR_RADIUS } from '../arenas';
import { UNCHAINED } from '../bosses/defs';
import { BossPhase, C, Collider, Dodge, Health, Knockback, Orbit, resetArenaState, resetRunState, RunStatus, Transform } from '../components';
import { RunViewWritable } from '../components/run-view';
import { inSeconds, meters, ticks } from '../core/units';
import { add, has, resetWorld, world, type EntityId } from '../core/world';
import { spawnBoss, spawnOrbitingPillar, spawnPlayer } from '../prefabs';
import { bodyCollisionSystem } from './collision';
import { startCutscene } from './cutscene';
import { movementSystem } from './motion';
import { orbitSystem, SPIKE_COOLDOWN, SPIKE_DMG, SPIKED_SPEED, spikeGrowthSystem, spikeSystem } from './pillars';

const DT = inSeconds(ticks(1));
const ORBIT = { radius: meters(9), angle: 0, speed: 0.5 };

let pillar: EntityId;
let player: EntityId;
let boss: EntityId;

function step(): void {
  orbitSystem(DT);
  spikeGrowthSystem();
  spikeSystem();
  world.tick++;
}

// Puts the player against the pillar's surface, on the side away from the orbit centre.
function touching(): void {
  const r = Collider.radius[pillar] + Collider.radius[player];
  Transform.x[player] = Transform.x[pillar] + r;
  Transform.z[player] = Transform.z[pillar];
}

beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  pillar = spawnOrbitingPillar(0, 0, ORBIT, PILLAR_RADIUS);
  player = spawnPlayer(0, 15);
  boss = spawnBoss(UNCHAINED, 0, -15);
});

describe('orbiting pillars', () => {
  it('go round their orbit at their speed', () => {
    for (let i = 0; i < 60; i++) step();
    expect(Orbit.angle[pillar]).toBeCloseTo(0.5, 4);
    expect(Transform.x[pillar]).toBeCloseTo(9 * Math.cos(0.5), 3);
    expect(Transform.z[pillar]).toBeCloseTo(9 * Math.sin(0.5), 3);
  });

  it('hold still during a cutscene, so nothing moves while your controls are locked', () => {
    startCutscene(ticks(30));
    const x = Transform.x[pillar];
    for (let i = 0; i < 30; i++) step();
    expect(Transform.x[pillar]).toBe(x);
  });

  it('push the player along instead of passing through, and never out of the arena', () => {
    // Standing right in the pillar's path for a whole lap.
    Transform.x[player] = 9 * Math.cos(0.3);
    Transform.z[player] = 9 * Math.sin(0.3);
    let deepest = 0;
    for (let i = 0; i < 60 * 13; i++) {
      orbitSystem(DT);
      movementSystem(DT);
      bodyCollisionSystem();
      const d = Math.hypot(Transform.x[player] - Transform.x[pillar], Transform.z[player] - Transform.z[pillar]);
      deepest = Math.max(deepest, Collider.radius[pillar] + Collider.radius[player] - d);
      expect(Math.abs(Transform.x[player])).toBeLessThanOrEqual(20);
      expect(Math.abs(Transform.z[player])).toBeLessThanOrEqual(20);
      world.tick++;
    }
    expect(deepest).toBeLessThan(0.01);
  });

  it('leave a lane between the ring and the walls wide enough to walk in arena 2', () => {
    const layout = ARENAS[1];
    const [cx, cz] = layout.orbitCenter;
    for (const o of layout.orbiting) {
      const outer = Math.max(Math.abs(cx), Math.abs(cz)) + o.radius + PILLAR_RADIUS;
      expect(20 - outer).toBeGreaterThan(2 * 0.45 + 1);
    }
    // And the fixed perch sits inside the ring, clear of it.
    const [px, pz] = layout.pillars[layout.perch];
    const inner = Math.min(...layout.orbiting.map((o) => o.radius)) - PILLAR_RADIUS;
    expect(Math.hypot(px - cx, pz - cz) + PILLAR_RADIUS).toBeLessThan(inner - 1);
  });
});

describe('spikes', () => {
  it('stay in while the boss is in phase 1', () => {
    touching();
    for (let i = 0; i < 10; i++) step();
    expect(has(pillar, C.Spiked)).toBe(false);
    expect(Health.hp[player]).toBe(100);
  });

  it('come out in phase 2, speed the pillars up, and hurt once per touch', () => {
    BossPhase.phase[boss] = 2;
    step();
    expect(has(pillar, C.Spiked)).toBe(true);
    const a = Orbit.angle[pillar];
    step();
    expect(Orbit.angle[pillar] - a).toBeCloseTo(0.5 * SPIKED_SPEED * DT, 5);

    touching();
    step();
    expect(Health.hp[player]).toBe(100 - SPIKE_DMG);
    // Shoved away from the pillar's centre.
    expect(Knockback.until[player]).toBeGreaterThan(world.tick);
    expect(Knockback.x[player]).toBeGreaterThan(0);

    for (let i = 1; i < SPIKE_COOLDOWN; i++) { touching(); step(); }
    expect(Health.hp[player]).toBe(100 - SPIKE_DMG);
    touching();
    step();
    expect(Health.hp[player]).toBe(100 - 2 * SPIKE_DMG);
  });

  it('come out straight away when the world is built in phase 2, as a load would', () => {
    BossPhase.phase[boss] = 2;
    spikeGrowthSystem();
    expect(has(pillar, C.Spiked)).toBe(true);
  });

  it('miss a dodge, like every other hit', () => {
    BossPhase.phase[boss] = 2;
    step();
    Dodge.until[player] = world.tick + 20;
    touching();
    step();
    expect(Health.hp[player]).toBe(100);
  });

  it('do nothing during a cutscene, and grow in while it plays', () => {
    BossPhase.phase[boss] = 2;
    startCutscene(ticks(30));
    touching();
    step();
    expect(has(pillar, C.Spiked)).toBe(true);
    expect(Health.hp[player]).toBe(100);
  });

  it('go back in when the boss is down, and never hurt after a clear', () => {
    BossPhase.phase[boss] = 2;
    step();
    add(boss, C.Dead);
    step();
    expect(has(pillar, C.Spiked)).toBe(false);

    BossPhase.phase[boss] = 2;
    RunViewWritable.status = RunStatus.Cleared;
    step();
    expect(has(pillar, C.Spiked)).toBe(false);
    touching();
    step();
    expect(Health.hp[player]).toBe(100);
  });
});
