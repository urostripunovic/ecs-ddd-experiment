import { Health, Hurt, LastHit } from '../components';
import type { EntityId, Handle } from '../core/world';

const HURT_FLASH_TICKS = 6;

// The single place hp goes down, so every source of damage also records
// who did it and triggers the hit flash.
export function hurt(target: EntityId, dmg: number, by: Handle): void {
  Health.hp[target] -= dmg;
  Hurt.flash[target] = HURT_FLASH_TICKS;
  LastHit.by[target] = by;
}
