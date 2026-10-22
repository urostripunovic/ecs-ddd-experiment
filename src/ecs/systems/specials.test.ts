// The special weapons: one per arena from arena 2, drawn from the seed.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  C, Dizzy, Durability, Health, Item, Knockback, PlayerInput, resetArenaState, resetRunState, RunStatus, Stock, StuckIn,
  Transform, Velocity,
} from '../components';
import { buf } from '../core/buffers';
import { Rng, seedStreams } from '../core/rng';
import { hp, inSeconds, inTicks, seconds, ticks } from '../core/units';
import { add, entityAt, has, query, remove, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS, specialFor } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, throwCharge } from '../weapons/charge';
import { dizzy } from './status';
import {
  CATCH_HASTE_TICKS, DIZZY_TICKS, SPECIALS, SMASH_RADIUS, SPIN_DMG_SHARE, SPIN_HIT_TICKS, WEAPONS, WeaponKind,
} from '../weapons/defs';
import { ChargeZone, spinThrow } from '../weapons/charge';
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

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  // The game's streams are module state: without this, how a dizzy player wanders
  // depends on what earlier tests drew.
  seedStreams(1);
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

  // Decided with the user: with your hands full when it comes home, it hits you
  // instead of your hand. It shoves you along its flight and drops where it hit.
  it('with your hands full when it comes back, it shoves you and drops where it hit you', () => {
    const item = chakram();
    throwAfter(PERFECT_TICKS);
    equip(p, spawnWeapon(WeaponKind.Sword, 0, 0));
    let hitAt = { x: 0, z: 0 };
    let shove = { x: 0, z: 0 };
    for (let i = 0; i < 240 && !has(item, C.Grounded); i++) {
      shove = { x: -Velocity.x[item], z: -Velocity.z[item] };
      step();
      if (has(item, C.Grounded)) hitAt = { x: Transform.x[p], z: Transform.z[p] };
    }
    expect(has(item, C.Grounded)).toBe(true);
    expect(Math.hypot(Transform.x[item] - hitAt.x, Transform.z[item] - hitAt.z)).toBeLessThan(1);
    // Shoved the way it was flying: home toward you, so away from where it came from.
    expect(Knockback.until[p]).toBeGreaterThan(world.tick);
    expect(Knockback.x[p] * -shove.x + Knockback.z[p] * -shove.z).toBeGreaterThan(0);
    expect(hasted(p)).toBe(false);
  });
});

describe('warhammer', () => {
  it('swings slow and heavy', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Warhammer, 0, 0));
    PlayerInput.fire = true;
    attackSystem(DT, new Rng(1));
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

  // Decided with the user: spinning too long has a price, like breaking it mid-spin.
  it('spinning past two seconds leaves you dizzy for as long as you overspun, at most two seconds', () => {
    hammer();
    PlayerInput.throwHeld = true;
    for (let i = 0; i < inTicks(seconds(2.5)); i++) step();
    PlayerInput.throwHeld = false;
    PlayerInput.throwReleases++;
    step();
    expect(dizzy(p)).toBe(true);
    for (let i = 0; i < inTicks(seconds(0.6)); i++) step();
    expect(dizzy(p)).toBe(false);
  });

  it('spinning under two seconds costs nothing', () => {
    hammer();
    PlayerInput.throwHeld = true;
    for (let i = 0; i < inTicks(seconds(1.8)); i++) step();
    PlayerInput.throwHeld = false;
    PlayerInput.throwReleases++;
    step();
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
    const rng = new Rng(3);
    Stock.special = WeaponKind.Railgun;
    for (let i = 0; i <= inTicks(seconds(5)) + 2; i++) { stockSystem(rng); world.tick++; }
    let rails = 0;
    const n = query(buf, C.Item);
    for (let i = 0; i < n; i++) if (Item.kind[entityAt(buf, i)] === WeaponKind.Railgun) rails++;
    expect(rails).toBe(1);
    expect(n).toBe(4);
  });
});
