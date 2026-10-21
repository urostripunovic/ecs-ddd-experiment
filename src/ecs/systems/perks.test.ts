import { beforeEach, describe, expect, it } from 'vitest';

import { WARDEN } from '../bosses/defs';
import {
  Ammo, C, Health, PlayerInput, Projectile, resetArenaState, resetRunState, RunStatus, Shake, Thrown, Transform,
  Velocity,
} from '../components';
import { RunViewWritable } from '../components/run-view';
import { buf } from '../core/buffers';
import { seedRng } from '../core/rng';
import { hp, inSeconds, ticks } from '../core/units';
import { has, query, resetWorld, world, type EntityId } from '../core/world';
import { spawnBoss, spawnPerk, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS } from '../weapons/charge';
import { WEAPONS, WeaponKind } from '../weapons/defs';
import { bodyCollisionSystem } from './collision';
import { inputSystem, movementSystem, snapshotSystem } from './motion';
import {
  addPerk, FINAL_SHOT_BLOWUP_DMG, hasPerk, LOW_HP, Perk, perkDropSystem, perkSlots, PERK_DMG_MUL, PERK_SPEED_MUL, setPerks,
} from './perks';
import { dmgMul, speedMul } from './status';
import {
  attackSystem, durabilitySystem, equip, flightSystem, heldFollowSystem, heldItem, pickupSystem, throwSystem,
} from './weapons';

const DT = inSeconds(ticks(1));

function step(): void {
  snapshotSystem();
  inputSystem();
  movementSystem(DT);
  bodyCollisionSystem();
  heldFollowSystem();
  throwSystem();
  attackSystem(DT);
  flightSystem();
  pickupSystem();
  durabilitySystem(DT);
  world.tick++;
}

function throwAfter(holdTicks: number): void {
  PlayerInput.throwHeld = true;
  for (let i = 0; i < holdTicks; i++) step();
  PlayerInput.throwHeld = false;
  PlayerInput.throwReleases++;
  step();
}

const projectiles = () => query(buf, C.Projectile);

let player: EntityId;
let boss: EntityId;
beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  PlayerInput.aimX = 0;
  PlayerInput.aimZ = -1;
  player = spawnPlayer(0, 0);
  boss = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -12);
});

describe('perk slots', () => {
  it('hold three, oldest first; a fourth pushes the oldest out', () => {
    addPerk(player, Perk.LastStand);
    addPerk(player, Perk.Adrenaline);
    addPerk(player, Perk.FinalShot);
    expect(perkSlots(player)).toEqual([Perk.LastStand, Perk.Adrenaline, Perk.FinalShot]);
    addPerk(player, Perk.Ricochet);
    expect(perkSlots(player)).toEqual([Perk.Adrenaline, Perk.FinalShot, Perk.Ricochet]);
    expect(hasPerk(player, Perk.LastStand)).toBe(false);
  });

  it('never hold the same perk twice: picking it again makes it the newest', () => {
    addPerk(player, Perk.LastStand);
    addPerk(player, Perk.Adrenaline);
    addPerk(player, Perk.LastStand);
    expect(perkSlots(player)).toEqual([Perk.Adrenaline, Perk.LastStand, Perk.None]);
  });

  it('are filled by walking over a perk pickup', () => {
    const pickup = spawnPerk(Perk.LongReach, 0, 0.5);
    step();
    expect(hasPerk(player, Perk.LongReach)).toBe(true);
    expect(world.inUse[pickup]).toBe(0);
  });
});

describe('low hp perks', () => {
  it('Last stand: more damage at low hp, none above it', () => {
    addPerk(player, Perk.LastStand);
    expect(dmgMul(player)).toBe(1);
    Health.hp[player] = Health.max[player] * LOW_HP;
    expect(dmgMul(player)).toBe(PERK_DMG_MUL);
  });

  it('Adrenaline: faster at low hp, not above it', () => {
    addPerk(player, Perk.Adrenaline);
    expect(speedMul(player)).toBe(1);
    Health.hp[player] = Health.max[player] * LOW_HP;
    expect(speedMul(player)).toBe(PERK_SPEED_MUL);
  });
});

describe('Final shot', () => {
  let gun: EntityId;
  beforeEach(() => {
    gun = spawnWeapon(WeaponKind.Gun, 0, 0);
    equip(player, gun);
    Ammo.count[gun] = 10;
    addPerk(player, Perk.FinalShot);
  });

  it('throwing the gun fires the rest of the magazine as one shot, and keeps the gun', () => {
    throwAfter(30);
    expect(heldItem(player)).toBe(gun);
    expect(Ammo.count[gun]).toBe(0);
    expect(projectiles()).toBe(1);
    const shot = buf[0] as EntityId;
    // Ten bullets' worth, scaled by how far the gauge got.
    expect(Projectile.dmg[shot]).toBeGreaterThan(WEAPONS[WeaponKind.Gun].dmg * 10 * 0.5);
    expect(Velocity.z[shot]).toBeLessThan(0);
  });

  it('overcharged, the gun blows up in your hands', () => {
    throwAfter(CHARGE_MAX_TICKS + 5);
    expect(projectiles()).toBe(0);
    expect(heldItem(player)).toBe(-1);
    expect(world.inUse[gun]).toBe(0);
    expect(Health.hp[player]).toBe(100 - FINAL_SHOT_BLOWUP_DMG);
    expect(Shake.trauma).toBeGreaterThan(0);
  });

  it('with an empty magazine the gun is thrown as usual', () => {
    Ammo.count[gun] = 0;
    throwAfter(30);
    expect(has(gun, C.Flying)).toBe(true);
  });

  it('without the perk the gun is thrown as usual', () => {
    setPerks(player, []);
    throwAfter(30);
    expect(has(gun, C.Flying)).toBe(true);
  });
});

describe('Ricochet', () => {
  it('a thrown sword bounces off a wall instead of landing, harder each bounce', () => {
    const sword = spawnWeapon(WeaponKind.Sword, 0, 0);
    equip(player, sword);
    addPerk(player, Perk.Ricochet);
    // Thrown east, at the wall 20 m away.
    PlayerInput.aimX = 1;
    PlayerInput.aimZ = 0;
    Transform.x[player] = 17;
    throwAfter(30);
    const dmg = Thrown.dmg[sword];
    for (let i = 0; i < 20 && Velocity.x[sword] > 0; i++) step();
    expect(has(sword, C.Flying)).toBe(true);
    expect(Velocity.x[sword]).toBeLessThan(0);
    expect(Thrown.dmg[sword]).toBeGreaterThan(dmg);
  });
});

describe('Long reach', () => {
  it('a spear thrust reaches further', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0);
    equip(player, spear);
    const reach = WEAPONS[WeaponKind.Spear].reach;
    // Just past the spear's normal reach to the boss's edge.
    Transform.z[boss] = -(reach + 1.3 + 0.6);
    PlayerInput.fire = true;
    step();
    PlayerInput.fire = false;
    expect(Health.hp[boss]).toBe(1000);
    for (let i = 0; i < 40; i++) step();
    addPerk(player, Perk.LongReach);
    PlayerInput.fire = true;
    step();
    PlayerInput.fire = false;
    expect(Health.hp[boss]).toBeLessThan(1000);
  });
});

describe('perk drops', () => {
  it('one perk pickup at a time, seeded, while fighting', () => {
    seedRng(3);
    for (let i = 0; i < 60 * 60; i++) {
      perkDropSystem();
      world.tick++;
    }
    expect(query(buf, C.PerkPickup)).toBe(1);
  });
});
