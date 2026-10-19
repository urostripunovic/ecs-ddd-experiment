// Per-kind numbers live here, not in components: components hold only what
// changes per entity (durability left, ammo left). Tuning a weapon is one line.

export const WeaponKind = { Fists: 0, Sword: 1, Spear: 2, Gun: 3 } as const;

export type WeaponDef = {
  readonly name: string;
  readonly attack: 'arc' | 'shoot';
  readonly dmg: number;
  readonly cooldown: number;    // seconds between attacks
  // arc attacks: hits everything within reach whose direction is inside the arc
  readonly reach: number;
  readonly arcCos: number;      // cos of the half-angle; 1 = a straight line
  // durability: 0 means it never wears out
  readonly durability: number;
  readonly wearPerHit: number;
  readonly decayPerSec: number;
  // shoot attacks
  readonly mag: number;
  readonly reloadTime: number;
  // throwing
  readonly throwSpeed: number;
  readonly throwDmg: number;
  readonly throwTicks: number;  // flight time before it drops on its own
  readonly throwWear: number;
  readonly throwLockTicks: number; // a missed throw can't be picked up again until this passes
};

const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

const base = {
  reach: 0, arcCos: 1, durability: 0, wearPerHit: 0, decayPerSec: 0,
  mag: 0, reloadTime: 0, throwSpeed: 0, throwDmg: 0, throwTicks: 0, throwWear: 0, throwLockTicks: 0,
};

// Indexed by WeaponKind.
export const WEAPONS: readonly WeaponDef[] = [
  { ...base, name: 'Fists', attack: 'arc', dmg: 8, cooldown: 0.45, reach: 1.5, arcCos: cosDeg(60) },
  {
    ...base, name: 'Sword', attack: 'arc', dmg: 55, cooldown: 0.4, reach: 2.4, arcCos: cosDeg(55),
    durability: 100, wearPerHit: 7, decayPerSec: 0.6,
    throwSpeed: 18, throwDmg: 60, throwTicks: 40, throwWear: 35, throwLockTicks: 90,
  },
  {
    ...base, name: 'Spear', attack: 'arc', dmg: 60, cooldown: 0.5, reach: 3.4, arcCos: cosDeg(15),
    durability: 100, wearPerHit: 6, decayPerSec: 0.5,
    throwSpeed: 26, throwDmg: 95, throwTicks: 45, throwWear: 40, throwLockTicks: 90,
  },
  {
    ...base, name: 'Gun', attack: 'shoot', dmg: 25, cooldown: 1 / 8, mag: 16, reloadTime: 1.1,
    throwSpeed: 16, throwDmg: 20, throwTicks: 35, throwLockTicks: 60,
  },
];

// How many of each kind the arena keeps in play, whatever state they are in
// (held, lying, flying or stuck). Indexed by WeaponKind; fists are never stocked.
// A broken one is replaced RESPAWN_TICKS later, somewhere clear.
export const WEAPON_STOCK: readonly number[] = [0, 1, 1, 1];
export const RESPAWN_TICKS = 5 * 60;

export const BuffKind = { Haste: 1, Fury: 2 } as const;
export const BUFF_TICKS = 6 * 60;
export const HASTE_MUL = 1.35;
export const FURY_MUL = 1.5;
