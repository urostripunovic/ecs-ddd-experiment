// Weapon items: the four states an item is in (Grounded, Held, Flying, Stuck), and
// the few functions that move it between them. Every other weapon module builds
// on these, so no item can end up half in two states.
import { Arena, C, Collider, Durability, GodMode, Item, RunStatus, RunView, Team, TeamId, Transform, Velocity, Wielder } from '../../components';
import { helperBuf } from '../../core/buffers';
import { after, inTicks, seconds, ticks } from '../../core/units';
import type { Ticks } from '../../core/units';
import { NOBODY, add, despawn, entityAt, handleAt, indexOf, isLive, mask, query, remove, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnWeapon } from '../../prefabs';
import { WEAPONS, WeaponKind, levelDmgMul, weaponLevelFor } from '../../weapons/defs';
import type { WeaponDef } from '../../weapons/defs';

export const WIELDERS = mask(C.Wielder, C.Transform);

export const HELD_ITEMS = mask(C.Item, C.Held);

export const FLYING_ITEMS = mask(C.Item, C.Flying, C.Transform);

export const GROUNDED = mask(C.Grounded, C.Transform);

export const STUCK_ITEMS = mask(C.Item, C.Stuck);

export const NOT_HELD = mask(C.Grounded, C.Flying, C.Stuck);

export const NOT_GROUNDED = mask(C.Held, C.Flying, C.Stuck);

export const TARGETS = mask(C.Health, C.Transform, C.Team, C.Collider);

// Blades and throws pass under anything mid-jump.
export const UNHITTABLE = mask(C.Dead, C.Airborne);

export const SOLIDS = mask(C.Transform, C.Collider, C.Solid);

export const BOSSES = mask(C.Boss, C.Transform);

export const PICKUP_RADIUS = 1.3;

export const DROP_LOCK_TICKS = ticks(45);  // long enough to walk off what you just dropped

export const RELEASE_LOCK_TICKS = ticks(20);

export const RELEASE_PUSH = 1.0; // knocked clear of the boss, so you don't have to stand inside its slam to grab it

export const SWING_TICKS = ticks(10);

export const BULLET_SPEED = 30;

export const THROWN_RADIUS = 0.45;

export const DROP_EVERY_TICKS = inTicks(seconds(7));

export const BULLET_LIFE = seconds(1.5);

export const MAX_ON_GROUND = 4;

// How close a chakram coming home must get to be caught.
export const CATCH_RADIUS = 1.0;

export const SMASH_SHAKE = 0.35;

// How long the flame shows after a tick of spraying, for the renderer.
export const SPRAY_SHOWN_TICKS = 2;

export const fighting = () => RunView.status === RunStatus.Fighting;

export function heldItem(w: EntityId): EntityId | -1 {
  const h = handleAt(Wielder.held, w);
  return isLive(h) ? indexOf(h) : -1;
}

export const defOf = (item: EntityId | -1): WeaponDef => WEAPONS[item === -1 ? WeaponKind.Fists : Item.kind[item]];

// What the item's level adds to every hit it deals; fists have none.
export const levelMul = (item: EntityId | -1): number => (item === -1 ? 1 : levelDmgMul(Item.level[item]));

// The one place a weapon loses durability, so the dev menu's "keep weapons" holds everywhere.
export function wear(item: EntityId, amount: number): void {
  if (!(import.meta.env.DEV && GodMode.keepWeapons)) Durability.value[item] -= amount;
}

// A fresh weapon of that kind in hand, at this arena's level (the Scattergun
// reward, the dev menu); whatever was held drops at your feet.
export function giveWeapon(w: EntityId, kind: number): void {
  const holding = heldItem(w);
  if (holding !== -1) putOnGround(holding, Transform.x[w], Transform.z[w], DROP_LOCK_TICKS);
  equip(w, spawnWeapon(kind, Transform.x[w], Transform.z[w], weaponLevelFor(RunView.arena)));
}

export function equip(w: EntityId, item: EntityId): void {
  remove(item, NOT_HELD);
  add(item, C.Held);
  Velocity.x[item] = Velocity.z[item] = 0;
  Team.id[item] = Team.id[w];
  Transform.x[item] = Transform.x[w];
  Transform.z[item] = Transform.z[w];
  Wielder.held[w] = toHandle(item);
}

// The one place an item comes to rest, so no item ever ends up inside a pillar
// or outside the arena, however it got there.
// Lets go of whatever is held: the one way a hand empties besides breaking.
export function emptyHand(w: EntityId): void {
  Wielder.held[w] = NOBODY;
}

export function putOnGround(item: EntityId, x: number, z: number, lock: Ticks): void {
  remove(item, NOT_GROUNDED);
  add(item, C.Grounded);
  Velocity.x[item] = Velocity.z[item] = 0;
  Team.id[item] = TeamId.Neutral;
  Item.pickupAt[item] = after(lock);

  const limit = Arena.half - 0.6;
  x = Math.max(-limit, Math.min(limit, x));
  z = Math.max(-limit, Math.min(limit, z));
  const n = query(helperBuf, SOLIDS, C.Dead);
  for (let i = 0; i < n; i++) {
    const s = entityAt(helperBuf, i);
    const dx = x - Transform.x[s];
    const dz = z - Transform.z[s];
    const min = Collider.radius[s] + 0.5;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    x = Transform.x[s] + (d === 0 ? 0 : dx / d) * min;
    z = Transform.z[s] + (d === 0 ? 1 : dz / d) * min;
  }
  Transform.x[item] = x;
  Transform.z[item] = z;
}

export function breakItem(item: EntityId): void {
  const h = toHandle(item);
  const n = query(helperBuf, C.Wielder);
  for (let i = 0; i < n; i++) {
    const w = entityAt(helperBuf, i);
    if (Wielder.held[w] === h) Wielder.held[w] = NOBODY;
  }
  despawn(item);
}
