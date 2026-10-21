import type { PerkName, WeaponKind as DomainWeaponKind } from '../../domain/run/run';
import { Perk } from '../../ecs/systems/perks';
import { WeaponKind } from '../../ecs/weapons/defs';

// The run names weapons; the simulation numbers them. Only the bridge knows both.
export const KIND_NUMBER: Record<DomainWeaponKind, number> = {
  sword: WeaponKind.Sword, spear: WeaponKind.Spear, gun: WeaponKind.Gun,
};
export const KIND_NAME: readonly (DomainWeaponKind | null)[] = [null, 'sword', 'spear', 'gun'];

// The same for perks: the run names them, the slots number them.
export const PERK_NUMBER: Record<PerkName, number> = {
  lastStand: Perk.LastStand, adrenaline: Perk.Adrenaline, finalShot: Perk.FinalShot,
  ricochet: Perk.Ricochet, longReach: Perk.LongReach,
};
export const PERK_NAME: readonly (PerkName | null)[] = [null, 'lastStand', 'adrenaline', 'finalShot', 'ricochet', 'longReach'];
