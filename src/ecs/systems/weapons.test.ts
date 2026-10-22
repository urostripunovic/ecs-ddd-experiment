import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Buffs, C, Durability, Health, RunStatus, PlayerInput, resetRunState, Slowed,
  Transform, Wielder,
} from '../components';
import { Rng } from '../core/rng';
import { hp, inSeconds, seconds, ticks } from '../core/units';
import { has, NOBODY, resetWorld, world, type EntityId } from '../core/world';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPlayer, spawnWeapon } from '../prefabs';
import { HASTE_MUL, WEAPONS, WeaponKind } from '../weapons/defs';
import { speedMul } from './status';
import {
  attackSystem, durabilitySystem, equip, heldItem, 
  
} from './weapons';
import { stepper } from '../tick-order';

const DT = inSeconds(ticks(1));
const boss = (hitPoints: number) => ({ ...WARDEN, hp: hp(hitPoints) });

// The weapon slice of the real tick order, without the boss's choreography.
const step = stepper(['snapshotSystem', 'inputSystem', 'movementSystem', 'bodyCollisionSystem', 'heldFollowSystem', 'stuckFollowSystem', 'throwSystem', 'attackSystem', 'flightSystem', 'returnSystem', 'pickupSystem', 'durabilitySystem']);

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  resetWorld();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
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
    attackSystem(DT, new Rng(1));
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Sword].dmg);
    expect(Durability.value[sword]).toBe(100 - WEAPONS[WeaponKind.Sword].wearPerHit);
  });

  it('misses what is behind', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Sword, 0, 0));
    Object.assign(PlayerInput, { aimX: 0, aimZ: 1, fire: true });
    attackSystem(DT, new Rng(1));
    expect(Health.hp[b]).toBe(1000);
  });
});

describe('durability', () => {
  it('decays while held and breaks at zero, leaving empty hands', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(p, spear);
    Durability.value[spear] = 0.004;
    durabilitySystem(DT);
    expect(Wielder.held[p]).toBe(NOBODY);
    expect(world.inUse[spear]).toBe(0);
  });

  it('only wears while held: on the ground, flying or stuck it waits to be picked up', () => {
    const lying = spawnWeapon(WeaponKind.Sword, 5, 5);
    durabilitySystem(seconds(30));
    expect(Durability.value[lying]).toBe(100);
    equip(p, lying);
    durabilitySystem(seconds(1));
    expect(Durability.value[lying]).toBeLessThan(100);
  });

  it('stops wearing once the match is over', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 0, 0);
    equip(p, sword);
    RunViewWritable.status = RunStatus.Lost;
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

describe('fists', () => {
  it('empty hands still fight, weakly', () => {
    Transform.z[b] = -2.4;
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT, new Rng(1));
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Fists].dmg);
  });
});

