// The special weapons: one per arena from arena 2, drawn from the seed.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Ammo, Burn, C, Durability, Health, Item, PlayerInput, resetArenaState, resetRunState, RunStatus, Stock, StuckIn,
  Transform, Wielder,
} from '../components';
import { buf } from '../core/buffers';
import { seedRng } from '../core/rng';
import { hp, inSeconds, inTicks, seconds, ticks } from '../core/units';
import { add, entityAt, has, query, remove, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS, specialFor } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, throwCharge } from '../weapons/charge';
import {
  BURN_TICKS, CATCH_HASTE_TICKS, RAIL_VENT, SPECIALS, SMASH_RADIUS, WEAPONS, WeaponKind,
} from '../weapons/defs';
import { bodyCollisionSystem } from './collision';
import { burnSystem, tracerSystem } from './specials';
import { inputSystem, movementSystem, snapshotSystem } from './motion';
import { hasted } from './status';
import {
  attackSystem, durabilitySystem, equip, flightSystem, heldFollowSystem, heldItem, pickupSystem, stockSystem,
  stuckFollowSystem, throwSystem,
} from './weapons';

const DT = inSeconds(ticks(1));
const PERFECT_TICKS = 44;
const PERFECT = throwCharge(PERFECT_TICKS / CHARGE_MAX_TICKS);

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
  burnSystem();
  durabilitySystem(DT);
  tracerSystem();
  world.tick++;
}

function throwAfter(holdTicks: number): void {
  PlayerInput.throwHeld = true;
  for (let i = 0; i < holdTicks; i++) step();
  PlayerInput.throwHeld = false;
  PlayerInput.throwReleases++;
  step();
}

// Holds fire for some ticks, then lets go, as the input layer counts it.
function fireAfter(holdTicks: number): void {
  PlayerInput.fire = true;
  for (let i = 0; i < holdTicks; i++) step();
  PlayerInput.fire = false;
  PlayerInput.fireReleases++;
  step();
}

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -6);
  Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: false, throwHeld: false, moveX: 0, moveZ: 0 });
});

describe('chakram', () => {
  const chakram = () => {
    const item = spawnWeapon(WeaponKind.Chakram, 0, 0);
    equip(p, item);
    return item;
  };

  it('hits on the way out and on the way back, then comes back to your hand with a burst of haste', () => {
    const item = chakram();
    throwAfter(PERFECT_TICKS);
    expect(has(item, C.Flying)).toBe(true);
    for (let i = 0; i < 240 && heldItem(p) !== item; i++) step();
    expect(heldItem(p)).toBe(item);
    expect(Health.hp[b]).toBeCloseTo(1000 - 2 * WEAPONS[WeaponKind.Chakram].throwDmg * PERFECT.dmgMul, 3);
    expect(hasted(p)).toBe(true);
    for (let i = 0; i < CATCH_HASTE_TICKS; i++) step();
    expect(hasted(p)).toBe(false);
  });

  it('never sticks: it flies through what it hits', () => {
    const item = chakram();
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 240 && heldItem(p) !== item; i++) {
      step();
      expect(has(item, C.Stuck)).toBe(false);
    }
  });

  // Playtest: walking over a weapon while it was out grabbed that instead, and the
  // chakram came home to full hands. Your hands are spoken for while it flies.
  it('while it is out, walking over another weapon does not pick it up', () => {
    const item = chakram();
    throwAfter(PERFECT_TICKS);
    const gun = spawnWeapon(WeaponKind.Gun, Transform.x[p], Transform.z[p]);
    for (let i = 0; i < 240 && heldItem(p) !== item; i++) step();
    expect(heldItem(p)).toBe(item);
    expect(has(gun, C.Grounded)).toBe(true);
  });

  it('lands at your feet when your hands are full as it comes back', () => {
    const item = chakram();
    throwAfter(PERFECT_TICKS);
    equip(p, spawnWeapon(WeaponKind.Sword, 0, 0));
    for (let i = 0; i < 240 && !has(item, C.Grounded); i++) step();
    expect(has(item, C.Grounded)).toBe(true);
    expect(Math.hypot(Transform.x[item] - Transform.x[p], Transform.z[item] - Transform.z[p])).toBeLessThan(2);
  });
});

describe('warhammer', () => {
  it('swings slow and heavy', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Warhammer, 0, 0));
    PlayerInput.fire = true;
    attackSystem(DT);
    expect(Health.hp[b]).toBe(1000 - WEAPONS[WeaponKind.Warhammer].dmg);
    expect(WEAPONS[WeaponKind.Warhammer].cooldown).toBeGreaterThan(WEAPONS[WeaponKind.Sword].cooldown);
  });

  it('thrown, it smashes where it comes down, never sticks, and knocks lodged weapons loose', () => {
    const spear = lodgedIn(b, spawnWeapon(WeaponKind.Spear, 0, -6));
    const hammer = spawnWeapon(WeaponKind.Warhammer, 0, 0);
    equip(p, hammer);
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 90 && !has(hammer, C.Grounded); i++) step();
    expect(has(hammer, C.Grounded)).toBe(true);
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Warhammer].throwDmg * PERFECT.dmgMul, 3);
    expect(has(spear, C.Grounded)).toBe(true);
  });

  it('a smash only hurts what is within its radius', () => {
    Transform.z[b] = -(SMASH_RADIUS + 9);
    const hammer = spawnWeapon(WeaponKind.Warhammer, 0, 0);
    equip(p, hammer);
    PlayerInput.aimZ = 1; // thrown the other way
    throwAfter(PERFECT_TICKS);
    for (let i = 0; i < 90 && !has(hammer, C.Grounded); i++) step();
    expect(Health.hp[b]).toBe(1000);
  });
});

// What a hit that lodges does, by hand, so the test needn't throw twice.
function lodgedIn(host: EntityId, item: EntityId): EntityId {
  remove(item, C.Grounded);
  add(item, C.Stuck);
  StuckIn.host[item] = toHandle(host);
  StuckIn.angle[item] = 0;
  return item;
}

describe('railgun', () => {
  const railgun = () => {
    const gun = spawnWeapon(WeaponKind.Railgun, 0, 0);
    equip(p, gun);
    return gun;
  };

  it('holding fire charges; nothing leaves until you let go', () => {
    railgun();
    PlayerInput.fire = true;
    for (let i = 0; i < 30; i++) step();
    expect(Health.hp[b]).toBe(1000);
    expect(Wielder.fireCharge[p]).toBe(30);
  });

  it('let go in the perfect zone, one beam pierces everything in its line', () => {
    const gun = railgun();
    const behind = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -12);
    fireAfter(PERFECT_TICKS);
    const dmg = WEAPONS[WeaponKind.Railgun].dmg * PERFECT.dmgMul;
    expect(Health.hp[b]).toBeCloseTo(1000 - dmg, 3);
    expect(Health.hp[behind]).toBeCloseTo(1000 - dmg, 3);
    expect(Ammo.count[gun]).toBe(WEAPONS[WeaponKind.Railgun].mag - 1);
    // The beam is drawn for a moment, then gone.
    expect(query(buf, C.Tracer)).toBe(1);
    for (let i = 0; i < 30; i++) step();
    expect(query(buf, C.Tracer)).toBe(0);
  });

  it('a pillar stops the beam', () => {
    railgun();
    spawnPillar(0, -3, PILLAR_RADIUS);
    fireAfter(PERFECT_TICKS);
    expect(Health.hp[b]).toBe(1000);
  });

  it('overcharged, it overheats: no shot, and it vents', () => {
    const gun = railgun();
    fireAfter(CHARGE_MAX_TICKS + 10);
    expect(Health.hp[b]).toBe(1000);
    expect(Ammo.count[gun]).toBe(WEAPONS[WeaponKind.Railgun].mag);
    expect(Ammo.reload[gun]).toBeGreaterThan(RAIL_VENT - 0.05);
  });

  it('never fires while venting or reloading', () => {
    const gun = railgun();
    Ammo.reload[gun] = 1;
    fireAfter(PERFECT_TICKS);
    expect(Health.hp[b]).toBe(1000);
  });
});

describe('flamethrower', () => {
  it('sets what is in the cone burning, and it keeps burning a while after you stop', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Flamethrower, 0, 0));
    PlayerInput.fire = true;
    step();
    PlayerInput.fire = false;
    expect(Burn.until[b]).toBeGreaterThan(world.tick);
    for (let i = 0; i < BURN_TICKS + 5; i++) step();
    // One touch of the flame: the whole burn, from the tick it caught.
    expect(1000 - Health.hp[b]).toBeCloseTo(WEAPONS[WeaponKind.Flamethrower].dmg * inSeconds(BURN_TICKS), 0);
    const after = Health.hp[b];
    step();
    expect(Health.hp[b]).toBe(after);
  });

  it('out of reach, nothing catches', () => {
    Transform.z[b] = -12;
    equip(p, spawnWeapon(WeaponKind.Flamethrower, 0, 0));
    PlayerInput.fire = true;
    for (let i = 0; i < 20; i++) step();
    expect(Health.hp[b]).toBe(1000);
  });

  it('burns fuel while it sprays, and runs dry', () => {
    const flamer = spawnWeapon(WeaponKind.Flamethrower, 0, 0);
    equip(p, flamer);
    PlayerInput.fire = true;
    for (let i = 0; i < inTicks(seconds(1)); i++) step();
    const used = WEAPONS[WeaponKind.Flamethrower].durability - Durability.value[flamer];
    expect(used).toBeGreaterThan(10);
    for (let i = 0; i < inTicks(seconds(12)) && heldItem(p) !== -1; i++) step();
    expect(heldItem(p)).toBe(-1);
  });
});

describe('specials in the stock', () => {
  it('none in the tutorial; one per arena after it, drawn from the seed', () => {
    for (let seed = 1; seed < 50; seed++) {
      expect(specialFor(seed, 1)).toBe(0);
      for (let arena = 2; arena <= 9; arena++) {
        expect(SPECIALS).toContain(specialFor(seed, arena));
        expect(specialFor(seed, arena)).toBe(specialFor(seed, arena));
      }
    }
    const drawn = new Set<number>();
    for (let seed = 1; seed < 50; seed++) drawn.add(specialFor(seed, 2));
    expect(drawn.size).toBe(SPECIALS.length);
  });

  it('the arena keeps its special stocked, like the others', () => {
    for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]]) spawnPillar(x, z, PILLAR_RADIUS);
    seedRng(3);
    Stock.special = WeaponKind.Railgun;
    for (let i = 0; i <= inTicks(seconds(5)) + 2; i++) { stockSystem(); world.tick++; }
    let rails = 0;
    const n = query(buf, C.Item);
    for (let i = 0; i < n; i++) if (Item.kind[entityAt(buf, i)] === WeaponKind.Railgun) rails++;
    expect(rails).toBe(1);
    expect(n).toBe(4);
  });
});
