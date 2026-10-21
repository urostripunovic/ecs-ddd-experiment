// Per-kind numbers live here, not in components: components hold only what
// changes per entity (durability left, ammo left). Tuning a weapon is one line.
// Each number carries its unit, because this table mixes four of them.
import { hp, inTicks, meters, seconds, ticks, type Hp, type Meters, type Seconds, type Ticks } from '../core/units';

export const WeaponKind = { Fists: 0, Sword: 1, Spear: 2, Gun: 3, Scattergun: 4 } as const;

export type WeaponDef = {
  readonly name: string;
  readonly attack: 'arc' | 'shoot';
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
};

const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

const base = {
  reach: meters(0), arcCos: 1, durability: 0, wearPerHit: 0, decayPerSec: 0,
  mag: 0, pellets: 1, spread: 0, reloadTime: seconds(0), throwSpeed: 0, throwDmg: hp(0), throwTicks: ticks(0), throwWear: 0,
  throwLockTicks: ticks(0),
};

// Indexed by WeaponKind.
export const WEAPONS: readonly WeaponDef[] = [
  { ...base, name: 'Fists', attack: 'arc', dmg: hp(8), cooldown: seconds(0.45), reach: meters(1.5), arcCos: cosDeg(60) },
  {
    ...base, name: 'Sword', attack: 'arc', dmg: hp(55), cooldown: seconds(0.4), reach: meters(2.4), arcCos: cosDeg(55),
    durability: 100, wearPerHit: 7, decayPerSec: 0.6,
    throwSpeed: 18, throwDmg: hp(60), throwTicks: ticks(40), throwWear: 35, throwLockTicks: inTicks(seconds(1.5)),
  },
  {
    ...base, name: 'Spear', attack: 'arc', dmg: hp(60), cooldown: seconds(0.5), reach: meters(3.4), arcCos: cosDeg(15),
    durability: 100, wearPerHit: 6, decayPerSec: 0.5,
    throwSpeed: 26, throwDmg: hp(95), throwTicks: ticks(45), throwWear: 40, throwLockTicks: inTicks(seconds(1.5)),
  },
  {
    ...base, name: 'Gun', attack: 'shoot', dmg: hp(25), cooldown: seconds(1 / 8), mag: 16, reloadTime: seconds(1.1),
    throwSpeed: 16, throwDmg: hp(20), throwTicks: ticks(35), throwLockTicks: inTicks(seconds(1)),
  },
  {
    // A boss reward, never stocked: six pellets in a fan, brutal up close, poor at range.
    ...base, name: 'Scattergun', attack: 'shoot', dmg: hp(14), cooldown: seconds(0.55), mag: 6, reloadTime: seconds(1.4),
    pellets: 6, spread: 0.2,
    throwSpeed: 15, throwDmg: hp(30), throwTicks: ticks(35), throwLockTicks: inTicks(seconds(1)),
  },
];

// How many of each kind the arena keeps in play, whatever state they are in
// (held, lying, flying or stuck). Indexed by WeaponKind; fists are never stocked.
// A broken one is replaced RESPAWN_TICKS later, somewhere clear.
export const WEAPON_STOCK: readonly number[] = [0, 1, 1, 1, 0];
export const RESPAWN_TICKS = inTicks(seconds(5));

export const BuffKind = { Haste: 1, Fury: 2 } as const;
export const BUFF_TICKS = inTicks(seconds(6));
export const HASTE_MUL = 1.35;
export const FURY_MUL = 1.5;
