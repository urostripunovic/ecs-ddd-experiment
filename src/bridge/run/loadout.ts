import type { PerkName, Reward, WeaponKind as DomainWeaponKind } from '../../domain/run/run';
import { RewardKind } from '../../ecs/systems/rewards';
import { Perk } from '../../ecs/systems/perks';
import { WeaponKind } from '../../ecs/weapons/defs';

// The run names weapons; the simulation numbers them. Only the bridge knows both.
export const KIND_NUMBER: Record<DomainWeaponKind, number> = {
  sword: WeaponKind.Sword, spear: WeaponKind.Spear, gun: WeaponKind.Gun, scattergun: WeaponKind.Scattergun,
};
export const KIND_NAME: readonly (DomainWeaponKind | null)[] = [null, 'sword', 'spear', 'gun', 'scattergun'];

// And for rewards: the run names them, the pedestals number them.
export const REWARD_KIND: Record<Reward, number> = {
  revive: RewardKind.Revive, armor: RewardKind.Armor, heal: RewardKind.Heal, scattergun: RewardKind.Scattergun,
};

// The same for perks: the run names them, the slots number them.
export const PERK_NUMBER: Record<PerkName, number> = {
  lastStand: Perk.LastStand, adrenaline: Perk.Adrenaline, finalShot: Perk.FinalShot,
  ricochet: Perk.Ricochet, longReach: Perk.LongReach,
};
export const PERK_NAME: readonly (PerkName | null)[] = [null, 'lastStand', 'adrenaline', 'finalShot', 'ricochet', 'longReach'];
