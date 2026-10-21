// Per-kind numbers live here, not in components: components hold only what
// changes per entity (durability left, ammo left). Tuning a weapon is one line.
// Each number carries its unit, because this table mixes four of them.
import { hp, inTicks, meters, seconds, ticks, type Hp, type Meters, type Seconds, type Ticks } from '../core/units';

export const WeaponKind = {
  Fists: 0, Sword: 1, Spear: 2, Gun: 3, Scattergun: 4, Chakram: 5, Warhammer: 6, Railgun: 7, Flamethrower: 8,
} as const;

export type WeaponDef = {
  readonly name: string;
  // arc: a melee swing. shoot: bullets. rail: charge on fire, one piercing beam on
  // the release. spray: a cone that sets what's in it burning while fire is held.
  readonly attack: 'arc' | 'shoot' | 'rail' | 'spray';
  readonly dmg: Hp;
  readonly cooldown: Seconds;   // between attacks
  // arc attacks: hits everything within reach whose direction is inside the arc
  readonly reach: Meters;
  readonly arcCos: number;      // cos of the half-angle; 1 = a straight line
  // durability: 0 means it never wears out
  readonly durability: number;
  readonly wearPerHit: number;
  readonly decayPerSec: number;
  // shoot attacks
  readonly mag: number;
  // Bullets per shot, spread evenly over `spread` radians either side of the aim.
  readonly pellets: number;
  readonly spread: number;
  readonly reloadTime: Seconds;
  // throwing
  readonly throwSpeed: number;
  readonly throwDmg: Hp;
  readonly throwTicks: Ticks;   // flight time before it drops on its own
  readonly throwWear: number;
  readonly throwLockTicks: Ticks; // a missed throw can't be picked up again until this passes
  // What a throw does on contact: stick in the target; fly through and come back
  // (the chakram); or smash down in an area where it stops (the warhammer).
  readonly throwStyle: 'stick' | 'return' | 'smash';
  // spray: fuel (durability) burned per second of spraying.
  readonly fuelPerSec: number;
  // What holding throw does: charge the timed gauge, or spin it round you (the warhammer).
  readonly heldThrow: 'charge' | 'spin';
  // Which perks this weapon carries out: Final shot turns its throw into the
  // rest of the magazine, Ricochet bounces it off walls, Long reach lengthens its thrusts.
  readonly finalShot: boolean;
  readonly ricochet: boolean;
  readonly longReach: boolean;
};

const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

const base = {
  reach: meters(0), arcCos: 1, durability: 0, wearPerHit: 0, decayPerSec: 0,
  mag: 0, pellets: 1, spread: 0, reloadTime: seconds(0), throwSpeed: 0, throwDmg: hp(0), throwTicks: ticks(0), throwWear: 0,
  throwLockTicks: ticks(0), throwStyle: 'stick' as const, fuelPerSec: 0,
  heldThrow: 'charge' as const, finalShot: false, ricochet: false, longReach: false,
};

// Indexed by WeaponKind.
export const WEAPONS: readonly WeaponDef[] = [
  { ...base, name: 'Fists', attack: 'arc', dmg: hp(8), cooldown: seconds(0.45), reach: meters(1.5), arcCos: cosDeg(60) },
  {
    ...base, name: 'Sword', attack: 'arc', dmg: hp(55), cooldown: seconds(0.4), reach: meters(2.4), arcCos: cosDeg(55),
    durability: 100, wearPerHit: 7, decayPerSec: 0.6,
    throwSpeed: 18, throwDmg: hp(60), throwTicks: ticks(40), throwWear: 35, throwLockTicks: inTicks(seconds(1.5)),
    ricochet: true,
  },
  {
    ...base, name: 'Spear', attack: 'arc', dmg: hp(60), cooldown: seconds(0.5), reach: meters(3.4), arcCos: cosDeg(15),
    durability: 100, wearPerHit: 6, decayPerSec: 0.5,
    throwSpeed: 26, throwDmg: hp(95), throwTicks: ticks(45), throwWear: 40, throwLockTicks: inTicks(seconds(1.5)),
    longReach: true,
  },
  {
    ...base, name: 'Gun', attack: 'shoot', dmg: hp(25), cooldown: seconds(1 / 8), mag: 16, reloadTime: seconds(1.1),
    throwSpeed: 16, throwDmg: hp(20), throwTicks: ticks(35), throwLockTicks: inTicks(seconds(1)),
    finalShot: true,
  },
  {
    // A boss reward, never stocked: six pellets in a fan, brutal up close, poor at range.
    ...base, name: 'Scattergun', attack: 'shoot', dmg: hp(14), cooldown: seconds(0.55), mag: 6, reloadTime: seconds(1.4),
    pellets: 6, spread: 0.2,
    throwSpeed: 15, throwDmg: hp(30), throwTicks: ticks(35), throwLockTicks: inTicks(seconds(1)),
  },
  {
    // Light and wide in the hand; thrown, it flies through what it hits and comes
    // back, hitting again on the way home. Catching it gives a burst of haste.
    ...base, name: 'Chakram', attack: 'arc', dmg: hp(30), cooldown: seconds(0.35), reach: meters(2.2), arcCos: cosDeg(70),
    durability: 100, wearPerHit: 3, decayPerSec: 0.3,
    throwSpeed: 20, throwDmg: hp(40), throwTicks: ticks(22), throwWear: 5, throwLockTicks: inTicks(seconds(1)),
    throwStyle: 'return',
  },
  {
    // Slow and heavy, and it wears fast. Thrown, it smashes down where it stops:
    // an area hit that also knocks weapons lodged in the boss loose.
    ...base, name: 'Warhammer', attack: 'arc', dmg: hp(90), cooldown: seconds(0.9), reach: meters(2.6), arcCos: cosDeg(65),
    durability: 100, wearPerHit: 10, decayPerSec: 0.4,
    throwSpeed: 13, throwDmg: hp(110), throwTicks: ticks(30), throwWear: 30, throwLockTicks: inTicks(seconds(1.5)),
    throwStyle: 'smash', heldThrow: 'spin',
  },
  {
    // The Final shot as a weapon: charge on fire, release one beam that pierces
    // every enemy in a line. The gauge is the throw's: perfect hits hardest,
    // overcharged overheats it.
    ...base, name: 'Railgun', attack: 'rail', dmg: hp(150), cooldown: seconds(0.2), mag: 3, reloadTime: seconds(1.8),
    throwSpeed: 16, throwDmg: hp(25), throwTicks: ticks(35), throwLockTicks: inTicks(seconds(1)),
  },
  {
    // A short cone while fire is held: what's in it burns at dmg a second, for a
    // while after it leaves. Its fuel is its durability.
    ...base, name: 'Flamethrower', attack: 'spray', dmg: hp(45), cooldown: seconds(0), reach: meters(5), arcCos: cosDeg(25),
    durability: 100, fuelPerSec: 14,
    throwSpeed: 14, throwDmg: hp(20), throwTicks: ticks(30), throwLockTicks: inTicks(seconds(1)),
  },
];

// The special weapons: an arena from the second on keeps one of these stocked
// on top of the basics, drawn from the seed (specialFor in arenas.ts).
export const SPECIALS: readonly number[] = [WeaponKind.Chakram, WeaponKind.Warhammer, WeaponKind.Railgun, WeaponKind.Flamethrower];
export const CATCH_HASTE_TICKS = inTicks(seconds(1.5));
// A chakram coming home gives up and lands after this long.
export const RETURN_TICKS = inTicks(seconds(3));
export const SMASH_RADIUS = meters(3);
export { RAIL_BLOOM_MAX } from './charge';
// A warhammer spinning on held throw hits all round you this often, for this
// share of a swing's damage, scaled by its momentum.
export const SPIN_HIT_TICKS = ticks(15);
export const SPIN_DMG_SHARE = 0.35;
// Breaking a hammer mid-spin leaves you dizzy this long.
export const DIZZY_TICKS = inTicks(seconds(2));
export const RAIL_TRACER_TICKS = ticks(10);
export const BURN_TICKS = inTicks(seconds(2));

// How many of each kind the arena keeps in play, whatever state they are in
// (held, lying, flying or stuck). Indexed by WeaponKind; fists are never stocked.
// A broken one is replaced RESPAWN_TICKS later, somewhere clear.
// Specials aren't in it: the arena's one special is added on top (Stock.special).
export const WEAPON_STOCK: readonly number[] = [0, 1, 1, 1, 0, 0, 0, 0, 0];
export const RESPAWN_TICKS = inTicks(seconds(5));

// Weapons found deeper hit harder. A weapon's level is the arena it turned up
// in (the Warden's are level 1), and each level past the first adds 15% to
// every hit it deals: 1 + 0.15 per arena of depth. Fists have no level.
export const LEVEL_DMG_STEP = 0.15;
// Uint8 storage, and no run has more arenas than this.
const MAX_LEVEL = 255;

export function weaponLevelFor(arena: number): number {
  if (!Number.isInteger(arena) || arena < 1 || arena > MAX_LEVEL) throw new RangeError(`no weapon level for arena ${arena}`);
  return arena;
}

export const levelDmgMul = (level: number): number => 1 + LEVEL_DMG_STEP * (level - 1);

export const BuffKind = { Haste: 1, Fury: 2 } as const;
export const BUFF_TICKS = inTicks(seconds(6));
export const HASTE_MUL = 1.35;
export const FURY_MUL = 1.5;
