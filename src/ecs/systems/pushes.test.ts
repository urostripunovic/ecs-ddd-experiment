// Pillars and what pushes them: weapons on the ground are shoved out of a
// moving pillar's way, and the warhammer and the railgun knock orbiting
// pillars along their circle, into the boss if you line it up.
import { beforeEach, describe, expect, it } from 'vitest';
import { UNCHAINED } from '../bosses/defs';
import { Arena, BossAction, C, Collider, Health, Orbit, PlayerInput, resetArenaState, resetRunState, RunStatus, Stagger, Transform } from '../components';
import { RunViewWritable } from '../components/run-view';
import { hp, inTicks, meters, seconds, after, ticks } from '../core/units';
import { has, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { spawnBoss, spawnOrbitingPillar, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { stepper } from '../tick-order';
import { CHARGE_MAX_TICKS } from '../weapons/charge';
import { WeaponKind } from '../weapons/defs';
import { PILLAR_HIT_DMG, pushPillar } from './pillars';
import { fireBeam } from './specials';
import { staggered } from './status';
import { equip } from './weapons';

const ORBIT = { radius: meters(9), angle: 0, speed: 0.5 };
let pillar: EntityId;
let player: EntityId;

beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  pillar = spawnOrbitingPillar(0, 0, ORBIT, PILLAR_RADIUS);
  player = spawnPlayer(0, 15);
  Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: false, throwHeld: false, moveX: 0, moveZ: 0 });
});

// Where the pillar would be after this many ticks with nothing pushing it.
const unpushedAngle = (ticksLater: number) => ORBIT.angle + ORBIT.speed * (ticksLater / 60);

describe('a moving pillar and a weapon on the ground', () => {
  it('shoves the weapon out of its way, never covering it, never out of the arena', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 9 * Math.cos(0.3), 9 * Math.sin(0.3));
    const turn = stepper(['orbitSystem']);
    for (let i = 0; i < inTicks(seconds(3)); i++) {
      turn();
      const d = Math.hypot(Transform.x[sword] - Transform.x[pillar], Transform.z[sword] - Transform.z[pillar]);
      expect(d).toBeGreaterThanOrEqual(Collider.radius[pillar] - 1e-3);
      expect(Math.abs(Transform.x[sword])).toBeLessThanOrEqual(Arena.half);
      expect(Math.abs(Transform.z[sword])).toBeLessThanOrEqual(Arena.half);
    }
    expect(has(sword, C.Grounded)).toBe(true);
  });
});

describe('pushing a pillar', () => {
  const turn = stepper(['orbitSystem']);
  const after = (n: number) => { for (let i = 0; i < n; i++) turn(); };

  it('a push along its circle kicks it that way, and it settles back to its own pace', () => {
    // At angle 0 the pillar moves along +z; a push toward +z speeds it on.
    pushPillar(pillar, 0, 1);
    after(30);
    expect(Orbit.angle[pillar]).toBeGreaterThan(unpushedAngle(30) + 0.05);
    const settled = Orbit.angle[pillar];
    after(inTicks(seconds(2)));
    expect(Orbit.angle[pillar] - settled).toBeCloseTo(ORBIT.speed * 2, 1);
  });

  it('a push against its way sends it back', () => {
    pushPillar(pillar, 0, -1);
    after(30);
    expect(Orbit.angle[pillar]).toBeLessThan(unpushedAngle(30) - 0.05);
  });

  it('a pillar that doesn\'t orbit stays where it is', () => {
    const fixed = spawnPillar(5, 5, PILLAR_RADIUS);
    pushPillar(fixed, 1, 0);
    after(30);
    expect([Transform.x[fixed], Transform.z[fixed]]).toEqual([5, 5]);
  });

  it('a railgun beam that stops on an orbiting pillar pushes it along the beam', () => {
    // Fired from below the pillar, straight up the +z axis at it.
    fireBeam(9, -6, 0, 1, 0, toHandle(player), 100);
    after(30);
    expect(Orbit.angle[pillar]).toBeGreaterThan(unpushedAngle(30) + 0.05);
  });

  it('a warhammer smashing down beside it pushes it away from the smash', () => {
    // Thrown up from below: it hits the pillar's underside and smashes there, pushing it toward +z.
    Transform.x[player] = 9;
    Transform.z[player] = -6;
    Object.assign(PlayerInput, { aimX: 0, aimZ: 1 });
    equip(player, spawnWeapon(WeaponKind.Warhammer, 9, -6));
    const play = stepper(['inputSystem', 'movementSystem', 'heldFollowSystem', 'throwSystem', 'flightSystem', 'returnSystem', 'orbitSystem']);
    PlayerInput.throwHeld = true;
    for (let i = 0; i < CHARGE_MAX_TICKS / 2; i++) play();
    PlayerInput.throwHeld = false;
    PlayerInput.throwReleases++;
    for (let i = 0; i < 60; i++) play();
    // Measured from the start of the test: the pillar went round while the throw charged too.
    expect(Orbit.angle[pillar]).toBeGreaterThan(unpushedAngle(world.tick) + 0.05);
  });
});

describe('a pushed pillar into the boss', () => {
  let boss: EntityId;
  beforeEach(() => {
    // Just ahead of the pillar on its circle, where a forward push carries it.
    boss = spawnBoss({ ...UNCHAINED, hp: hp(1000) }, 9 * Math.cos(0.45), 9 * Math.sin(0.45));
  });

  it('hurts it once and staggers it', () => {
    pushPillar(pillar, 0, 1);
    const fight = stepper(['bossPhaseSystem', 'orbitSystem']);
    for (let i = 0; i < 40; i++) fight();
    expect(Health.hp[boss]).toBe(1000 - PILLAR_HIT_DMG);
    expect(staggered(boss)).toBe(true);
    expect(Stagger.until[boss]).toBeGreaterThan(world.tick);
    while (staggered(boss)) fight();
    expect(Health.hp[boss]).toBe(1000 - PILLAR_HIT_DMG);
  });

  // The first version of this test only checked the boss was idle, which it
  // was anyway while it walked: a mutation that ignored the stagger passed it.
  it('a staggered boss stands still and starts nothing; afterwards it carries on', () => {
    const fight = stepper(['bossPhaseSystem', 'movementSystem']);
    for (let i = 0; i < 5; i++) fight();
    Stagger.until[boss] = after(ticks(60));
    const [x, z, started] = [Transform.x[boss], Transform.z[boss], BossAction.startedAt[boss]];
    for (let i = 0; i < 59; i++) fight();
    expect([Transform.x[boss], Transform.z[boss]]).toEqual([x, z]);
    expect(BossAction.startedAt[boss]).toBe(started);
    for (let i = 0; i < 120; i++) fight();
    expect(Math.hypot(Transform.x[boss] - x, Transform.z[boss] - z)).toBeGreaterThan(0.5);
  });

  it('a pillar going round at its own pace never hurts it', () => {
    const turn = stepper(['orbitSystem']);
    for (let i = 0; i < 60; i++) turn();
    expect(Health.hp[boss]).toBe(1000);
    expect(staggered(boss)).toBe(false);
  });
});
