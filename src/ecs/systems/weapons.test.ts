import { beforeEach, describe, expect, it } from 'vitest';
import {
  Ammo, Buffs, C, Collider, Durability, Health, Item, MatchStatus, MatchView, PlayerInput, resetComponents, Slowed,
  Transform, Wielder,
} from '../components';
import { seedRng } from '../core/rng';
import { add, has, NO_HANDLE, resetWorld, world, type EntityId } from '../core/world';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { HASTE_MUL, WEAPONS, WeaponKind } from '../weapons/defs';
import { bodyCollisionSystem } from './collision';
import { inputSystem, movementSystem, snapshotSystem } from './motion';
import { speedMul } from './status';
import {
  attackSystem, dropSystem, durabilitySystem, equip, flightSystem, heldFollowSystem, heldItem, pickupSystem,
  releaseStuck, stuckFollowSystem, throwSystem,
} from './weapons';

const DT = 1 / 60;

// The weapon slice of the real tick order, without the boss's choreography.
function step(): void {
  snapshotSystem();
  inputSystem();
  movementSystem(DT);
  bodyCollisionSystem();
  heldFollowSystem();
  stuckFollowSystem();
  throwSystem();
  attackSystem(DT);
  flightSystem();
  pickupSystem();
  durabilitySystem(DT);
  world.tick++;
}

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  resetWorld();
  resetComponents();
  MatchView.status = MatchStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss(0, -6, 1000);
});

describe('pickup', () => {
  it('empty hands pick up a weapon by walking onto it', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 0, 1);
    step();
    expect(heldItem(p)).toBe(sword);
    expect(has(sword, C.Held)).toBe(true);
  });

  it('full hands only swap on interact, and the dropped weapon is not grabbed straight back', () => {
    const gun = spawnWeapon(WeaponKind.Gun, 0, 0);
    step();
    const sword = spawnWeapon(WeaponKind.Sword, 0, 1);
    step();
    expect(heldItem(p)).toBe(gun);

    PlayerInput.interactPresses++;
    step();
    expect(heldItem(p)).toBe(sword);
    expect(has(gun, C.Grounded)).toBe(true);
    step();
    expect(heldItem(p)).toBe(sword);
  });
});

describe('melee', () => {
  it('a sword hits what is in front and in reach, and wears once per swing', () => {
    Transform.z[b] = -3;
    const sword = spawnWeapon(WeaponKind.Sword, 0, 0);
    equip(p, sword);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT);
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Sword].dmg);
    expect(Durability.value[sword]).toBe(100 - WEAPONS[WeaponKind.Sword].wearPerHit);
  });

  it('misses what is behind', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Sword, 0, 0));
    Object.assign(PlayerInput, { aimX: 0, aimZ: 1, fire: true });
    attackSystem(DT);
    expect(Health.hp[b]).toBe(1000);
  });
});

describe('durability', () => {
  it('decays while held and breaks at zero, leaving empty hands', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Durability.value[spear] = 0.004;
    durabilitySystem(DT);
    expect(Wielder.held[p]).toBe(NO_HANDLE);
    expect(world.alive[spear]).toBe(0);
  });

  it('stops wearing once the match is over', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 0, 0);
    equip(p, sword);
    MatchView.status = MatchStatus.Lost;
    durabilitySystem(1);
    expect(Durability.value[sword]).toBe(100);
  });

  it('a gun never wears out', () => {
    const gun = spawnWeapon(WeaponKind.Gun, 0, 0);
    equip(p, gun);
    for (let i = 0; i < 600; i++) durabilitySystem(DT);
    expect(heldItem(p)).toBe(gun);
  });
});

describe('throwing', () => {
  it('a thrown gun hurts the boss, sticks in it, and keeps its ammo', () => {
    const gun = spawnWeapon(WeaponKind.Gun, 0, 0);
    equip(p, gun);
    Ammo.count[gun] = 5;
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1 });
    PlayerInput.throwPresses++;
    step();
    expect(has(gun, C.Flying)).toBe(true);
    expect(heldItem(p)).toBe(-1);

    for (let i = 0; i < 60 && !has(gun, C.Stuck); i++) step();
    expect(has(gun, C.Stuck)).toBe(true);
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Gun].throwDmg);

    // It rides along when the boss moves.
    Transform.x[b] += 3;
    step();
    expect(Transform.x[gun]).toBeCloseTo(Transform.x[b], 1);

    // A slam or a landing knocks it loose, just clear of the boss.
    releaseStuck(b);
    expect(has(gun, C.Grounded)).toBe(true);
    expect(Ammo.count[gun]).toBe(5);
    const d = Math.hypot(Transform.x[gun] - Transform.x[b], Transform.z[gun] - Transform.z[b]);
    expect(d).toBeGreaterThan(Collider.radius[b]);
  });

  it('a missed throw cannot be picked up again straight away', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 0, 0);
    equip(p, sword);
    Object.assign(PlayerInput, { aimX: 1, aimZ: 0 });
    PlayerInput.throwPresses++;
    for (let i = 0; i < 80 && !has(sword, C.Grounded); i++) step();
    expect(Item.pickupAt[sword] - world.tick).toBeGreaterThan(60);
  });

  it('a stuck weapon drops when its host dies', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1 });
    PlayerInput.throwPresses++;
    for (let i = 0; i < 60 && !has(spear, C.Stuck); i++) step();
    add(b, C.Dead);
    stuckFollowSystem();
    expect(has(spear, C.Grounded)).toBe(true);
  });

  it('a weapon thrown at a pillar lands beside it, never inside', () => {
    const pillar = spawnPillar(4, 0, 1.4);
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 1, aimZ: 0 });
    PlayerInput.throwPresses++;
    for (let i = 0; i < 60 && !has(spear, C.Grounded); i++) step();
    const d = Math.hypot(Transform.x[spear] - Transform.x[pillar], Transform.z[spear] - Transform.z[pillar]);
    expect(d).toBeGreaterThanOrEqual(Collider.radius[pillar]);
  });
});

describe('status', () => {
  it('haste and a slam slow combine instead of overwriting each other', () => {
    Buffs.hasteUntil[p] = world.tick + 60;
    Slowed.until[p] = world.tick + 60;
    Slowed.factor[p] = 0.5;
    expect(speedMul(p)).toBeCloseTo(HASTE_MUL * 0.5);

    world.tick += 60; // both deadlines pass; nothing had to count them down
    expect(speedMul(p)).toBe(1);
  });
});

describe('drops', () => {
  const dropAt = (seed: number) => {
    resetWorld();
    resetComponents();
    MatchView.status = MatchStatus.Fighting;
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, 1.4);
    spawnPlayer(0, 12);
    spawnBoss(0, -8, 1000);
    seedRng(seed);
    world.tick = 7 * 60;
    const before = world.nextFresh;
    dropSystem();
    return world.nextFresh > before ? [Transform.x[before], Transform.z[before]] : null;
  };

  it('the same seed drops in the same place', () => {
    expect(dropAt(42)).toEqual(dropAt(42));
  });

  it('never drops inside a pillar or on the boss', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const spot = dropAt(seed);
      if (!spot) continue;
      for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) {
        expect(Math.hypot(spot[0] - x, spot[1] - z)).toBeGreaterThan(1.4);
      }
      expect(Math.hypot(spot[0], spot[1] + 8)).toBeGreaterThan(1.3);
    }
  });
});

