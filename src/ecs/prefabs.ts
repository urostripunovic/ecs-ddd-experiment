import {
  C, Collider, Health, LastHit, Projectile, Shape, ShapeKind, Team, TeamId, Transform, Velocity, Weapon,
} from './components';
import { add, mask, NO_HANDLE, spawn, type EntityId, type Handle } from './core/world';

const PLAYER = mask(C.Transform, C.Velocity, C.Health, C.Weapon, C.Team, C.Collider, C.Shape, C.PlayerControlled);
const BOSS = mask(C.Transform, C.Velocity, C.Health, C.Team, C.Collider, C.Solid, C.Shape, C.Boss);
const PILLAR = mask(C.Transform, C.Collider, C.Solid, C.Shape);
const PROJECTILE = mask(C.Transform, C.Velocity, C.Team, C.Projectile, C.Shape);

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
  Weapon.mag[e] = Weapon.ammo[e] = 16;
  Weapon.rate[e] = 8;
  Weapon.reloadTime[e] = 1.1;
  Weapon.dmg[e] = 25;
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
