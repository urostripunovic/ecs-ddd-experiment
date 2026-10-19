import {
  Ammo, BuffPickup, C, Collider, Durability, Health, Item, LastHit, PlayerInput, Pressure, Projectile, Shape, ShapeKind,
  Team, TeamId, Transform, Velocity, Wielder,
} from './components';
import { add, mask, NO_HANDLE, spawn, world, type EntityId, type Handle } from './core/world';
import { WEAPONS } from './weapons/defs';

const PLAYER = mask(C.Transform, C.Velocity, C.Health, C.Wielder, C.Team, C.Collider, C.Shape, C.PlayerControlled);
const BOSS = mask(C.Transform, C.Velocity, C.Health, C.Team, C.Collider, C.Solid, C.Shape, C.Boss);
const PILLAR = mask(C.Transform, C.Collider, C.Solid, C.Shape);
const PROJECTILE = mask(C.Transform, C.Velocity, C.Team, C.Projectile, C.Shape);
// Velocity and Team are there from the start so throwing only swaps state tags.
const ITEM = mask(C.Transform, C.Velocity, C.Team, C.Item, C.Shape, C.Grounded);
const BUFF = mask(C.Transform, C.BuffPickup, C.Shape, C.Grounded);

const WEAPON_SHAPE = [ShapeKind.None, ShapeKind.Sword, ShapeKind.Spear, ShapeKind.Gun];
const BUFF_SHAPE = [ShapeKind.None, ShapeKind.Haste, ShapeKind.Fury];

// A recycled slot still holds its old previous-position; without resetting it
// the entity would be drawn sliding in from where the last occupant died.
function place(e: EntityId, x: number, z: number): void {
  Transform.x[e] = Transform.px[e] = x;
  Transform.y[e] = Transform.py[e] = 0;
  Transform.z[e] = Transform.pz[e] = z;
  Velocity.x[e] = Velocity.y[e] = Velocity.z[e] = 0;
  // 0 is a valid handle (the first entity), so "nobody" must be said explicitly.
  LastHit.by[e] = NO_HANDLE;
}

export function spawnPlayer(x: number, z: number): EntityId {
  const e = spawn();
  add(e, PLAYER);
  place(e, x, z);
  Health.hp[e] = Health.max[e] = 100;
  Wielder.held[e] = NO_HANDLE;
  // Starts caught up with the input counters, so presses from before it existed
  // (a previous arena) aren't replayed as a throw the moment it spawns.
  Wielder.throwSeen[e] = PlayerInput.throwReleases;
  Wielder.interactSeen[e] = PlayerInput.interactPresses;
  Team.id[e] = TeamId.Player;
  Collider.radius[e] = 0.45;
  Shape.kind[e] = ShapeKind.Player;
  return e;
}

export function spawnBoss(x: number, z: number, hp: number): EntityId {
  const e = spawn();
  add(e, BOSS);
  place(e, x, z);
  Health.hp[e] = Health.max[e] = hp;
  Team.id[e] = TeamId.Enemy;
  Collider.radius[e] = 1.3;
  Shape.kind[e] = ShapeKind.Boss;
  Pressure.hpMark[e] = hp;
  Pressure.markedAt[e] = world.tick;
  // No evading in the opening seconds, while the player is still finding range.
  Pressure.evadeReadyAt[e] = world.tick + 4 * 60;
  return e;
}

export function spawnPillar(x: number, z: number, radius: number): EntityId {
  const e = spawn();
  add(e, PILLAR);
  place(e, x, z);
  Collider.radius[e] = radius;
  Shape.kind[e] = ShapeKind.Pillar;
  return e;
}

export function spawnProjectile(
  x: number, z: number, dirX: number, dirZ: number, speed: number,
  team: number, owner: Handle, dmg: number, life: number, kind: number,
): EntityId {
  const e = spawn();
  add(e, PROJECTILE);
  place(e, x, z);
  Velocity.x[e] = dirX * speed;
  Velocity.z[e] = dirZ * speed;
  Team.id[e] = team;
  Projectile.owner[e] = owner;
  Projectile.dmg[e] = dmg;
  Projectile.life[e] = life;
  Shape.kind[e] = kind;
  return e;
}

// Spawns on the ground; equipping is a pickup like any other.
export function spawnWeapon(kind: number, x: number, z: number): EntityId {
  const e = spawn();
  add(e, ITEM);
  place(e, x, z);
  const def = WEAPONS[kind];
  Item.kind[e] = kind;
  Item.pickupAt[e] = world.tick;
  Durability.value[e] = def.durability;
  Ammo.count[e] = def.mag;
  Ammo.reload[e] = 0;
  Team.id[e] = TeamId.Neutral;
  Shape.kind[e] = WEAPON_SHAPE[kind];
  return e;
}

export function spawnBuff(kind: number, x: number, z: number): EntityId {
  const e = spawn();
  add(e, BUFF);
  place(e, x, z);
  BuffPickup.kind[e] = kind;
  Shape.kind[e] = BUFF_SHAPE[kind];
  return e;
}
