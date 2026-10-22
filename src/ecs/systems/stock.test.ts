// What keeps an arena supplied: the weapon stock, buff drops, and weapon levels.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Ammo, C, Durability, Health, Item, Projectile, RunStatus, PlayerInput, resetRunState, 
  Thrown, Transform, 
} from '../components';
import { buf } from '../core/buffers';
import { Rng } from '../core/rng';
import { hp, inSeconds, ticks } from '../core/units';
import { entityAt, has, query, resetWorld, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, throwCharge } from '../weapons/charge';
import { RESPAWN_TICKS, WEAPONS, WeaponKind, weaponLevelFor } from '../weapons/defs';
import { addPerk, Perk } from './perks';
import {
  attackSystem, dropSystem, durabilitySystem, equip, giveWeapon, heldItem, 
  stockSystem, 
} from './weapons';
import { stepper } from '../tick-order';

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

describe('stock', () => {
  const count = (kind: number) => {
    let n = 0;
    for (let e = 0; e < world.nextFresh; e++) if (world.inUse[e] && has(e as EntityId, C.Item) && Item.kind[e] === kind) n++;
    return n;
  };
  // Where replacements appear: its own stream, so the spots are the same every run.
  let rng = new Rng(3);
  const stockArena = () => {
    rng = new Rng(3);
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    spawnWeapon(WeaponKind.Gun, 0, 12);
    spawnWeapon(WeaponKind.Spear, 4, 9);
    return spawnWeapon(WeaponKind.Sword, -4, 9);
  };

  it('a broken sword comes back after the respawn delay, somewhere clear', () => {
    const sword = stockArena();
    stockSystem(rng);
    expect(count(WeaponKind.Sword)).toBe(1);

    equip(p, sword);
    Durability.value[sword] = 0;
    durabilitySystem(DT);
    expect(count(WeaponKind.Sword)).toBe(0);
    expect(heldItem(p)).toBe(-1); // fists until then

    for (let i = 0; i < RESPAWN_TICKS; i++) { stockSystem(rng); world.tick++; }
    expect(count(WeaponKind.Sword)).toBe(0);
    stockSystem(rng);
    expect(count(WeaponKind.Sword)).toBe(1);
    expect(count(WeaponKind.Spear)).toBe(1);
    expect(count(WeaponKind.Gun)).toBe(1);
  });

  it('never adds weapons while the stock is full', () => {
    stockArena();
    for (let i = 0; i < RESPAWN_TICKS * 3; i++) { stockSystem(rng); world.tick++; }
    expect(count(WeaponKind.Sword) + count(WeaponKind.Spear) + count(WeaponKind.Gun)).toBe(3);
  });
});

describe('drops', () => {
  const dropAt = (seed: number) => {
    resetWorld();
    resetRunState();
    RunViewWritable.status = RunStatus.Fighting;
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    spawnPlayer(0, 12);
    spawnBoss(boss(1000), 0, -8);
    const rng = new Rng(seed);
    world.tick = 7 * 60;
    const before = world.nextFresh;
    dropSystem(rng);
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

// Stage B: a weapon found deeper hits harder. Its level is the arena it was
// found in, and every hit it deals is scaled by 1 + 0.15 per level past the first.
describe('levels', () => {
  const LEVEL_3 = 1.3;

  it('a weapon spawns at level 1 unless told otherwise, and keeps the level it was given', () => {
    expect(Item.level[spawnWeapon(WeaponKind.Sword, 0, 5)]).toBe(1);
    expect(Item.level[spawnWeapon(WeaponKind.Sword, 0, 5, 3)]).toBe(3);
  });

  it('scales a swing', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Sword, 0, 0, 3));
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT, new Rng(1));
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Sword].dmg * LEVEL_3, 3);
  });

  it('scales every pellet of a shot', () => {
    equip(p, spawnWeapon(WeaponKind.Scattergun, 0, 0, 3));
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT, new Rng(1));
    const n = query(buf, C.Projectile);
    expect(n).toBe(WEAPONS[WeaponKind.Scattergun].pellets);
    for (let i = 0; i < n; i++) {
      expect(Projectile.dmg[entityAt(buf, i)]).toBeCloseTo(WEAPONS[WeaponKind.Scattergun].dmg * LEVEL_3, 3);
    }
  });

  it('scales a throw', () => {
    const spear = spawnWeapon(WeaponKind.Spear, 0, 0, 3);
    equip(p, spear);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: false });
    throwAfter(PERFECT_TICKS);
    expect(Thrown.dmg[spear]).toBeCloseTo(WEAPONS[WeaponKind.Spear].throwDmg * PERFECT.dmgMul * LEVEL_3, 3);
  });

  it('scales the Final shot, but never the blow-up in your own hands', () => {
    const gun = spawnWeapon(WeaponKind.Gun, 0, 0, 3);
    equip(p, gun);
    Ammo.count[gun] = 10;
    addPerk(p, Perk.FinalShot);
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: false });
    throwAfter(PERFECT_TICKS);
    expect(query(buf, C.Projectile)).toBe(1);
    expect(Projectile.dmg[entityAt(buf, 0)]).toBeCloseTo(WEAPONS[WeaponKind.Gun].dmg * 10 * PERFECT.dmgMul * LEVEL_3, 2);
  });

  it('never scales fists', () => {
    Transform.z[b] = -2.4;
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    attackSystem(DT, new Rng(1));
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Fists].dmg);
  });

  it('stock comes back at the level of the arena it appears in', () => {
    RunViewWritable.arena = 4;
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    const rng = new Rng(3);
    for (let i = 0; i <= RESPAWN_TICKS + 1; i++) { stockSystem(rng); world.tick++; }
    const n = query(buf, C.Item);
    expect(n).toBe(3);
    for (let i = 0; i < n; i++) expect(Item.level[entityAt(buf, i)]).toBe(weaponLevelFor(4));
    expect(weaponLevelFor(4)).toBe(4);
  });

  it('a weapon given in an arena (the Scattergun reward, the dev menu) has its level', () => {
    RunViewWritable.arena = 3;
    giveWeapon(p, WeaponKind.Scattergun);
    expect(Item.level[heldItem(p)]).toBe(3);
  });
});
