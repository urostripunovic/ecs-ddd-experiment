import { C, Health, Hurt, LastHit, RunStatus, RunView } from '../components';
import { has, type EntityId, type Handle } from '../core/world';
import { dodging } from './status';

const HURT_FLASH_TICKS = 6;

// The single place hp goes down, so every source of damage also records
// who did it and triggers the hit flash. Returns whether it took hp, so a
// hit's side effects (a slow) skip whoever shrugged it off.
export function hurt(target: EntityId, dmg: number, by: Handle): boolean {
  // Still flashes, so the player can see the hit arrived but was shrugged off.
  Hurt.flash[target] = HURT_FLASH_TICKS;
  // Once the run has left Fighting, its title card has shown and that outcome
  // stands: a bullet already in flight can't undo a clear.
  if (RunView.status !== RunStatus.Fighting) return false;
  // Two sources, two writers: the roar's tag and the dodge's deadline, combined only here.
  if (has(target, C.Invulnerable) || dodging(target)) return false;
  Health.hp[target] -= dmg;
  LastHit.by[target] = by;
  return true;
}
