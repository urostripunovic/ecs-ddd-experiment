import { Armor, C, GodMode, Health, Hurt, LastHit, Revive, RunStatus, RunView } from '../components';
import { has, world, type EntityId, type Handle } from '../core/world';
import { armorPlates } from './armor';
import { dodging } from './status';

const HURT_FLASH_TICKS = 6;

// The single place hp goes down, so every source of damage also records
// who did it and triggers the hit flash. Returns whether it took hp, so a
// hit's side effects (a slow) skip whoever shrugged it off.
export function hurt(target: EntityId, dmg: number, by: Handle): boolean {
  // Still flashes, so the player can see the hit arrived but was shrugged off.
  Hurt.flash[target] = HURT_FLASH_TICKS;
  // A design choice for this game, not a rule: after the clear, a bullet already
  // in flight can't hurt you. Delete this line for a game where it should; the
  // run already loses if you go down in a cleared arena (R8).
  if (RunView.status !== RunStatus.Fighting) return false;
  // Two sources, two writers: the roar's tag and the dodge's deadline, combined only here.
  if (has(target, C.Invulnerable) || dodging(target)) return false;
  // Dev builds only: release compiles this check away.
  if (import.meta.env.DEV && GodMode.invulnerable && has(target, C.PlayerControlled)) return false;
  // Just revived: a moment to get your bearings.
  if (world.tick < Revive.shieldUntil[target]) return false;
  // A plate takes the whole hit, whatever its size, and breaks. After the
  // god-mode check, so cheating doesn't cost you plates.
  if (armorPlates(target) > 0) {
    Armor.broken[target]++;
    return false;
  }
  Health.hp[target] -= dmg;
  LastHit.by[target] = by;
  return true;
}
