// Perks: three slots per player, oldest first. Picking up a fourth pushes the
// oldest out. What they do is read where the effect happens (status.ts for the
// low-hp ones, the weapon systems for the rest); the run carries the slots
// between arenas through the loadout.
import { C, Health, PerkDrop, Perks, RunStatus, RunView } from '../components';
import { helperBuf } from '../core/buffers';
import { random } from '../core/rng';
import { after, hp, inTicks, seconds, share, shareOf } from '../core/units';
import { entityAt, mask, query, world, type EntityId } from '../core/world';
import { spawnPerk } from '../prefabs';
import { randomClearSpot } from './spots';

export const Perk = { None: 0, LastStand: 1, Adrenaline: 2, FinalShot: 3, Ricochet: 4, LongReach: 5 } as const;
export const PERK_KINDS = 5;

// At or below this share of max hp, the low-hp perks switch on.
export const LOW_HP = share(0.3);
export const PERK_DMG_MUL = 1.5;
export const PERK_SPEED_MUL = 1.25;
export const FINAL_SHOT_BLOWUP_DMG = hp(25);
export const RICOCHET_BOUNCES = 2;
export const RICOCHET_DMG_MUL = 1.25;
export const LONG_REACH_MUL = 1.5;

const FIRST_PERK_AFTER = inTicks(seconds(5));
const PERK_EVERY = inTicks(seconds(20));
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Health);
const LIVE_BOSSES = mask(C.Boss, C.Health);

export const hasPerk = (entity: EntityId, kind: number) =>
  Perks.s0[entity] === kind || Perks.s1[entity] === kind || Perks.s2[entity] === kind;

export const lowHp = (entity: EntityId) => shareOf(Health.hp[entity], Health.max[entity]) <= LOW_HP;

export function perkSlots(entity: EntityId): number[] {
  return [Perks.s0[entity], Perks.s1[entity], Perks.s2[entity]];
}

// Writes the slots from a list, oldest first; the spawn projection uses it to
// hand a new arena's player what the run carried.
export function setPerks(entity: EntityId, kinds: readonly number[]): void {
  Perks.s0[entity] = kinds[0] ?? Perk.None;
  Perks.s1[entity] = kinds[1] ?? Perk.None;
  Perks.s2[entity] = kinds[2] ?? Perk.None;
}

// A queue of three with no repeats: a perk you already have moves to newest.
export function addPerk(entity: EntityId, kind: number): void {
  const kept = perkSlots(entity).filter((k) => k !== Perk.None && k !== kind);
  setPerks(entity, [...kept, kind].slice(-3));
}

// reads RunView, PerkDrop, PerkPickup count, rng | writes PerkDrop; spawns a perk pickup
// One perk on the ground at a time: the first a few seconds into the fight, then
// every PERK_EVERY. It offers a perk the player doesn't have yet, when there is one.
export function perkDropSystem(): void {
  if (RunView.status !== RunStatus.Fighting) return;
  if (query(helperBuf, LIVE_BOSSES, C.Dead) === 0) return;
  if (PerkDrop.nextAt === 0) { PerkDrop.nextAt = after(FIRST_PERK_AFTER); return; }
  if (world.tick < PerkDrop.nextAt) return;
  PerkDrop.nextAt = after(PERK_EVERY);
  if (query(helperBuf, mask(C.PerkPickup, C.Grounded)) > 0) return;

  const players = query(helperBuf, LIVE_PLAYERS, C.Dead);
  const player = players > 0 ? entityAt(helperBuf, 0) : -1;
  let missing = 0;
  for (let kind = 1; kind <= PERK_KINDS; kind++) if (player === -1 || !hasPerk(player, kind)) missing++;
  // Holding all of them: offer any, which just refreshes one.
  let pick = Math.floor(random() * (missing || PERK_KINDS));
  let kind = 1;
  for (; kind <= PERK_KINDS; kind++) {
    if (missing > 0 && player !== -1 && hasPerk(player, kind)) continue;
    if (pick-- === 0) break;
  }
  if (randomClearSpot(dropSpot)) spawnPerk(kind, dropSpot.x, dropSpot.z);
}

const dropSpot = { x: 0, z: 0 };
