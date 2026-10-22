// Throwing: flight, sticking, landing, and the charged throw gauge.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Ammo, C, Collider, Durability, Health, Item, RunStatus, PlayerInput, resetRunState, 
  Transform, Wielder,
} from '../components';
import { hp } from '../core/units';
import { add, has, resetWorld, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, ChargeZone, throwCharge } from '../weapons/charge';
import { WEAPONS, WeaponKind } from '../weapons/defs';
import {
  equip, heldItem, 
  releaseStuck, stuckFollowSystem, 
} from './weapons';
import { stepper } from '../tick-order';

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
const step = stepper(['snapshotSystem', 'inputSystem', 'movementSystem', 'bodyCollisionSystem', 'heldFollowSystem', 'stuckFollowSystem', 'throwSystem', 'attackSystem', 'flightSystem', 'pickupSystem', 'durabilitySystem']);

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  resetWorld();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss(boss(1000), 0, -6);
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
