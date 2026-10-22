// The special weapons: one per arena from arena 2, drawn from the seed.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Ammo, Burn, C, Dizzy, Durability, Health, Item, PlayerInput, resetArenaState, resetRunState, RunStatus, Stock, StuckIn,
  Tracer, Transform, Wielder,
} from '../components';
import { buf } from '../core/buffers';
import { seedRng } from '../core/rng';
import { hp, inSeconds, inTicks, seconds, ticks } from '../core/units';
import { add, despawn, entityAt, has, query, remove, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS, specialFor } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, throwCharge } from '../weapons/charge';
import { dizzy } from './status';
import {
  BURN_TICKS, CATCH_HASTE_TICKS, DIZZY_TICKS, RAIL_BLOOM_MAX, SPECIALS, SMASH_RADIUS, SPIN_DMG_SHARE, SPIN_HIT_TICKS, WEAPONS, WeaponKind,
} from '../weapons/defs';
import { ChargeZone, railBloom, spinThrow } from '../weapons/charge';
import { hasted } from './status';
import {
  attackSystem, equip, heldItem, stockSystem,
  
} from './weapons';
import { stepper } from '../tick-order';

const DT = inSeconds(ticks(1));
const PERFECT_TICKS = 44;
const PERFECT = throwCharge(PERFECT_TICKS / CHARGE_MAX_TICKS);

const step = stepper(['snapshotSystem', 'inputSystem', 'movementSystem', 'bodyCollisionSystem', 'heldFollowSystem', 'stuckFollowSystem', 'throwSystem', 'attackSystem', 'flightSystem', 'pickupSystem', 'burnSystem', 'durabilitySystem', 'tracerSystem']);

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
    // The boss is 6 m off, out of the spin's reach: the only hit is the smash.
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Warhammer].throwDmg * spinThrow(PERFECT_TICKS / CHARGE_MAX_TICKS).dmgMul, 3);
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

  // The user's call: like hip-fire, holding too long doesn't stop the shot, it
  // throws it off line, the more the further into the overcharge.
  it('overcharged, it still fires at full power, but blooms off your aim', () => {
    const angles: number[] = [];
    for (let shot = 0; shot < 30; shot++) {
      const gun = railgun();
      Ammo.count[gun] = 3;
      fireAfter(CHARGE_MAX_TICKS + 10);
      const n = query(buf, C.Tracer);
      const beam = entityAt(buf, n - 1);
      angles.push(Math.atan2(Tracer.z1[beam] - Transform.z[beam], Tracer.x1[beam] - Transform.x[beam]) + Math.PI / 2);
      for (let i = n - 1; i >= 0; i--) despawn(entityAt(buf, i));
    }
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(RAIL_BLOOM_MAX + 1e-6);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(RAIL_BLOOM_MAX / 2);
  });

  it('blooms wider the further into the overcharge, and never inside the perfect zone', () => {
    expect(railBloom(PERFECT_TICKS / CHARGE_MAX_TICKS)).toBe(0);
    expect(railBloom(0.85)).toBeGreaterThan(0);
    expect(railBloom(1)).toBeGreaterThan(railBloom(0.85));
    expect(railBloom(1)).toBe(RAIL_BLOOM_MAX);
  });

  it('a bloomed shot hits as hard as a perfect one', () => {
    railgun();
    // Point blank, so even a wide bloom goes through the boss.
    Transform.z[b] = -1.9;
    fireAfter(CHARGE_MAX_TICKS + 10);
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Railgun].dmg * PERFECT.dmgMul, 3);
  });

  it('never fires while venting or reloading', () => {
    const gun = railgun();
    Ammo.reload[gun] = 1;
    fireAfter(PERFECT_TICKS);
    expect(Health.hp[b]).toBe(1000);
  });
});

describe('warhammer spin', () => {
  const hammer = () => {
    const item = spawnWeapon(WeaponKind.Warhammer, 0, 0);
    equip(p, item);
    return item;
  };

  it('holding throw spins it round you, hitting what is within reach on every side', () => {
    hammer();
    // Behind you: a swing would never reach it, a spin does.
    Transform.z[b] = 3;
    PlayerInput.throwHeld = true;
    for (let i = 0; i < SPIN_HIT_TICKS * 4; i++) step();
    // Four turns' worth of hits, each a share of a swing scaled by the momentum so far.
    const first = WEAPONS[WeaponKind.Warhammer].dmg * SPIN_DMG_SHARE * spinThrow(0).dmgMul;
    expect(1000 - Health.hp[b]).toBeGreaterThan(3 * first);
    expect(1000 - Health.hp[b]).toBeLessThan(4 * WEAPONS[WeaponKind.Warhammer].dmg * SPIN_DMG_SHARE * spinThrow(1).dmgMul + 1e-6);
  });

  it('released, it is thrown harder the longer it spun, with no perfect zone and no overcharge', () => {
    const dmg = [10, 30, CHARGE_MAX_TICKS, CHARGE_MAX_TICKS + 40].map((t) => spinThrow(t / CHARGE_MAX_TICKS).dmgMul);
    expect(dmg[0]).toBeLessThan(dmg[1]);
    expect(dmg[1]).toBeLessThan(dmg[2]);
    expect(dmg[3]).toBe(dmg[2]);
    for (const t of [0.5, 0.74, 0.9, 1]) expect(spinThrow(t).zone).toBe(ChargeZone.Building);
  });

  it('breaking mid-spin leaves you dizzy for a while', () => {
    const item = hammer();
    PlayerInput.throwHeld = true;
    step();
    Durability.value[item] = 0;
    step();
    expect(heldItem(p)).toBe(-1);
    expect(dizzy(p)).toBe(true);
    PlayerInput.throwHeld = false;
    for (let i = 0; i < DIZZY_TICKS; i++) step();
    expect(dizzy(p)).toBe(false);
  });

  it('breaking any other way doesn\'t', () => {
    const item = hammer();
    Durability.value[item] = 0;
    step();
    expect(heldItem(p)).toBe(-1);
    expect(dizzy(p)).toBe(false);
  });

  it('dizzy, your feet wander: standing still drifts, and walking straight goes off line', () => {
    Dizzy.until[p] = DIZZY_TICKS;
    for (let i = 0; i < 30; i++) step();
    expect(Math.hypot(Transform.x[p], Transform.z[p])).toBeGreaterThan(0.3);
    Transform.x[p] = 0; Transform.z[p] = 0;
    PlayerInput.moveX = 1;
    for (let i = 0; i < 30; i++) step();
    expect(Math.abs(Transform.z[p])).toBeGreaterThan(0.1);
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
