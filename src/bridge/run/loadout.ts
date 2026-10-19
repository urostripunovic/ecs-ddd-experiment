import type { WeaponKind as DomainWeaponKind } from '../../domain/run/run';
import { WeaponKind } from '../../ecs/weapons/defs';

// The run names weapons; the simulation numbers them. Only the bridge knows both.
export const KIND_NUMBER: Record<DomainWeaponKind, number> = {
  sword: WeaponKind.Sword, spear: WeaponKind.Spear, gun: WeaponKind.Gun,
};
export const KIND_NAME: readonly (DomainWeaponKind | null)[] = [null, 'sword', 'spear', 'gun'];
