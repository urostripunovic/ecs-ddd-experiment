import { beforeEach, describe, expect, it } from 'vitest';
import {
  Ammo, Buffs, C, Collider, Durability, Health, Item, RunStatus, RunView, PlayerInput, resetRunState, Slowed,
  Transform, Wielder,
} from '../components';
import { seedRng } from '../core/rng';
import { hp, inSeconds, seconds, ticks } from '../core/units';
import { add, has, NO_HANDLE, resetWorld, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, ChargeZone, throwCharge } from '../weapons/charge';
import { HASTE_MUL, RESPAWN_TICKS, WEAPONS, WeaponKind } from '../weapons/defs';
import { bodyCollisionSystem } from './collision';
import { inputSystem, movementSystem, snapshotSystem } from './motion';
import { speedMul } from './status';
import {
  attackSystem, dropSystem, durabilitySystem, equip, flightSystem, heldFollowSystem, heldItem, pickupSystem,
  releaseStuck, stockSystem, stuckFollowSystem, throwSystem,
} from './weapons';

const DT = inSeconds(ticks(1));
const boss = (hitPoints: number) => ({ ...WARDEN, hp: hp(hitPoints) });
// 44 of 60 ticks: inside the perfect zone (68-80% of the gauge).
const PERFECT_TICKS = 44;
const PERFECT = throwCharge(PERFECT_TICKS / CHARGE_MAX_TICKS);

// Holds the throw for some ticks, then lets go, exactly as the input layer would.
function throwAfter(holdTicks: number): void {
  PlayerInput.throwHeld = true;
  for (let i = 0; i < holdTicks; i++) step();
  PlayerInput.throwHeld = false;
  PlayerInput.throwReleases++;
  step();
}

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
  resetRunState();
  RunView.status = RunStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss(boss(1000), 0, -6);
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
    RunView.status = RunStatus.Lost;
    durabilitySystem(seconds(1));
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
    throwAfter(PERFECT_TICKS);
    expect(has(gun, C.Flying)).toBe(true);
    expect(heldItem(p)).toBe(-1);

    for (let i = 0; i < 60 && !has(gun, C.Stuck); i++) step();
    expect(has(gun, C.Stuck)).toBe(true);
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Gun].throwDmg * PERFECT.dmgMul, 3);

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
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 80 && !has(sword, C.Grounded); i++) step();
    expect(Item.pickupAt[sword] - world.tick).toBeGreaterThan(60);
  });

  it('a stuck weapon drops when its host dies', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1 });
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 60 && !has(spear, C.Stuck); i++) step();
    add(b, C.Dead);
    stuckFollowSystem();
    expect(has(spear, C.Grounded)).toBe(true);
  });

  it('a weapon thrown at a pillar lands beside it, never inside', () => {
    const pillar = spawnPillar(4, 0, PILLAR_RADIUS);
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 1, aimZ: 0 });
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 60 && !has(spear, C.Grounded); i++) step();
    const d = Math.hypot(Transform.x[spear] - Transform.x[pillar], Transform.z[spear] - Transform.z[pillar]);
    expect(d).toBeGreaterThanOrEqual(Collider.radius[pillar]);
  });
});

describe('charged throw', () => {
  it('the gauge: weak when tapped, strongest and gentlest in the perfect zone, strongest but harshest when overcharged', () => {
    expect(throwCharge(0)).toMatchObject({ zone: ChargeZone.Building, dmgMul: 0.4, wearMul: 1 });
    expect(throwCharge(0.74)).toMatchObject({ zone: ChargeZone.Perfect, dmgMul: 1.25, wearMul: 0.5 });
    expect(throwCharge(1)).toMatchObject({ zone: ChargeZone.Overcharged, dmgMul: 1.25, wearMul: 2 });
  });

  // Wear is measured from release to impact, so decay while charging doesn't blur it.
  const wearOnHit = (holdTicks: number) => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1 });
    throwAfter(holdTicks);
    const atRelease = Durability.value[spear];
    for (let i = 0; i < 60 && !has(spear, C.Stuck); i++) step();
    return { wear: atRelease - Durability.value[spear], dmg: 1000 - Health.hp[b] };
  };

  it('a perfect throw hits hardest and barely wears the spear', () => {
    const { wear, dmg } = wearOnHit(PERFECT_TICKS);
    expect(dmg).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwDmg * 1.25, 3);
    expect(wear).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwWear * 0.5, 3);
  });

  it('an overcharged throw hits just as hard but wears it four times as much', () => {
    const { wear, dmg } = wearOnHit(CHARGE_MAX_TICKS + 20); // held past full: the gauge caps
    expect(dmg).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwDmg * 1.25, 3);
    expect(wear).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwWear * 2, 3);
  });

  it('a tap still throws, weakly', () => {
    const { dmg } = wearOnHit(0);
    expect(dmg).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwDmg * 0.4, 3);
  });

  it('empty hands charge nothing', () => {
    PlayerInput.throwHeld = true;
    for (let i = 0; i < 30; i++) step();
    expect(Wielder.charge[p]).toBe(0);
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

describe('stock', () => {
  const count = (kind: number) => {
    let n = 0;
    for (let e = 0; e < world.nextFresh; e++) if (world.alive[e] && has(e as EntityId, C.Item) && Item.kind[e] === kind) n++;
    return n;
  };
  const stockArena = () => {
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    seedRng(3);
    spawnWeapon(WeaponKind.Gun, 0, 12);
    spawnWeapon(WeaponKind.Spear, 4, 9);
    return spawnWeapon(WeaponKind.Sword, -4, 9);
  };

  it('a broken sword comes back after the respawn delay, somewhere clear', () => {
    const sword = stockArena();
    stockSystem();
    expect(count(WeaponKind.Sword)).toBe(1);

    equip(p, sword);
    Durability.value[sword] = 0;
    durabilitySystem(DT);
    expect(count(WeaponKind.Sword)).toBe(0);
    expect(heldItem(p)).toBe(-1); // fists until then

    for (let i = 0; i < RESPAWN_TICKS; i++) { stockSystem(); world.tick++; }
    expect(count(WeaponKind.Sword)).toBe(0);
    stockSystem();
    expect(count(WeaponKind.Sword)).toBe(1);
    expect(count(WeaponKind.Spear)).toBe(1);
    expect(count(WeaponKind.Gun)).toBe(1);
  });

  it('never adds weapons while the stock is full', () => {
    stockArena();
    for (let i = 0; i < RESPAWN_TICKS * 3; i++) { stockSystem(); world.tick++; }
    expect(count(WeaponKind.Sword) + count(WeaponKind.Spear) + count(WeaponKind.Gun)).toBe(3);
  });
});

describe('fists', () => {
  it('empty hands still fight, weakly', () => {
    Transform.z[b] = -2.4;
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT);
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Fists].dmg);
  });
});

describe('drops', () => {
  const dropAt = (seed: number) => {
    resetWorld();
    resetRunState();
    RunView.status = RunStatus.Fighting;
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    spawnPlayer(0, 12);
    spawnBoss(boss(1000), 0, -8);
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

