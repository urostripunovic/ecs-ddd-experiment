import { C, Health, Hurt, LastHit } from '../components';
import { has, type EntityId, type Handle } from '../core/world';

const HURT_FLASH_TICKS = 6;

// The single place hp goes down, so every source of damage also records
// who did it and triggers the hit flash.
export function hurt(target: EntityId, dmg: number, by: Handle): void {
  // Still flashes, so the player can see the hit landed but was shrugged off.
  Hurt.flash[target] = HURT_FLASH_TICKS;
  if (has(target, C.Invulnerable)) return;
  Health.hp[target] -= dmg;
  LastHit.by[target] = by;
}
