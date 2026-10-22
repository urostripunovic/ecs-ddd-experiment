import type { Door, PerkName, Reward, WeaponKind as DomainWeaponKind } from '../../domain/run/run';
import { RewardKind } from '../../ecs/systems/rewards';
import { Perk } from '../../ecs/systems/perks';
import { DoorNumber } from '../../ecs/systems/tunnel';
import { WeaponKind } from '../../ecs/weapons/defs';

// The run names weapons; the simulation numbers them. Only the bridge knows both.
export const KIND_NUMBER: Record<DomainWeaponKind, number> = {
  sword: WeaponKind.Sword, spear: WeaponKind.Spear, gun: WeaponKind.Gun, scattergun: WeaponKind.Scattergun,
  chakram: WeaponKind.Chakram, warhammer: WeaponKind.Warhammer, railgun: WeaponKind.Railgun, flamethrower: WeaponKind.Flamethrower,
};

// And for rewards: the run names them, the pedestals number them.
export const REWARD_KIND: Record<Reward, number> = {
  revive: RewardKind.Revive, armor: RewardKind.Armor, heal: RewardKind.Heal, scattergun: RewardKind.Scattergun,
};

// The same for perks: the run names them, the slots number them.
export const PERK_NUMBER: Record<PerkName, number> = {
  lastStand: Perk.LastStand, adrenaline: Perk.Adrenaline, finalShot: Perk.FinalShot,
  ricochet: Perk.Ricochet, longReach: Perk.LongReach,
};

// And for the doors out of a cleared arena.
export const DOOR_NUMBER: Record<Door, number> = { onward: DoorNumber.Onward, final: DoorNumber.Final };

// The way back, from the simulation's number to the run's word, is derived from
// the tables above and never written by hand: a second hand-written list drifts
// from the first without a word. A Map, so a miss is honestly undefined instead
// of an index the types promise is there.
function invert<Name extends string>(table: Record<Name, number>): ReadonlyMap<number, Name> {
  return new Map(Object.entries(table).map(([name, number]) => [number as number, name as Name]));
}

// A number the simulation has and the run has no word for is a bug on the
// simulation's side, not a rule the run decides, so it throws rather than
// reaching the rules as something else (no weapon, the onward door).
function nameIn<Name>(names: ReadonlyMap<number, Name>, number: number, what: string): Name {
  const name = names.get(number);
  if (name === undefined) throw new RangeError(`the run has no name for ${what} ${number}`);
  return name;
}

// An empty hand and an empty slot are the only numbers with no word: null, said on purpose.
const KIND_NAME = new Map<number, DomainWeaponKind | null>([...invert(KIND_NUMBER), [WeaponKind.Fists, null]]);
const PERK_NAME = new Map<number, PerkName | null>([...invert(PERK_NUMBER), [Perk.None, null]]);
const DOOR_NAME = invert(DOOR_NUMBER);

export const kindNameOf = (kind: number): DomainWeaponKind | null => nameIn(KIND_NAME, kind, 'weapon kind');
export const perkNameOf = (perk: number): PerkName | null => nameIn(PERK_NAME, perk, 'perk');
export const doorNameOf = (door: number): Door => nameIn(DOOR_NAME, door, 'door');
