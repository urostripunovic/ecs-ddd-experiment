import {
  Ammo, BossPace, BossPhase, BossStyle, BuffPickup, C, Collider, Dodge, Durability, Health, Item, LastHit, Orbit, PerkPickup, PlayerInput, RewardPickup, Pressure, Projectile,
  Shape, ShapeKind, Team, TeamId, Transform, Velocity, Wielder,
} from './components';
import type { OrbitDef } from './arenas';
import type { BossDef } from './bosses/defs';
import { after, type Hp, type Meters, type Seconds } from './core/units';
import { add, mask, NOBODY, spawn, world, type EntityId, type Handle } from './core/world';
import { WEAPONS } from './weapons/defs';

const PLAYER = mask(C.Transform, C.Velocity, C.Health, C.Wielder, C.Team, C.Collider, C.Shape, C.PlayerControlled);
const BOSS = mask(C.Transform, C.Velocity, C.Health, C.Team, C.Collider, C.Solid, C.Shape, C.Boss);
const PILLAR = mask(C.Transform, C.Collider, C.Solid, C.Shape);
const PROJECTILE = mask(C.Transform, C.Velocity, C.Team, C.Projectile, C.Shape);
// Velocity and Team are there from the start so throwing only swaps state tags.
const ITEM = mask(C.Transform, C.Velocity, C.Team, C.Item, C.Shape, C.Grounded);
const BUFF = mask(C.Transform, C.BuffPickup, C.Shape, C.Grounded);
const PERK = mask(C.Transform, C.PerkPickup, C.Shape, C.Grounded);
const REWARD = mask(C.Transform, C.RewardPickup, C.Shape);

const WEAPON_SHAPE = [ShapeKind.None, ShapeKind.Sword, ShapeKind.Spear, ShapeKind.Gun, ShapeKind.Scattergun];
const BUFF_SHAPE = [ShapeKind.None, ShapeKind.Haste, ShapeKind.Fury];

// A recycled slot still holds its old previous-position; without resetting it
// the entity would be drawn sliding in from where the last occupant died.
function place(entity: EntityId, x: number, z: number): void {
  Transform.x[entity] = Transform.px[entity] = x;
  Transform.y[entity] = Transform.py[entity] = 0;
  Transform.z[entity] = Transform.pz[entity] = z;
  Velocity.x[entity] = Velocity.y[entity] = Velocity.z[entity] = 0;
  // 0 is a valid handle (the first entity), so "nobody" must be said explicitly.
  LastHit.by[entity] = NOBODY;
}

export function spawnPlayer(x: number, z: number): EntityId {
  const player = spawn();
  add(player, PLAYER);
  place(player, x, z);
  Health.hp[player] = Health.max[player] = 100;
  Wielder.held[player] = NOBODY;
  // Starts caught up with the input counters, so presses from before it existed
  // (a previous arena) aren't replayed as a throw the moment it spawns.
  Wielder.throwSeen[player] = PlayerInput.throwReleases;
  Wielder.interactSeen[player] = PlayerInput.interactPresses;
  Dodge.seen[player] = PlayerInput.dodgePresses;
  Team.id[player] = TeamId.Player;
  Collider.radius[player] = 0.45;
  Shape.kind[player] = ShapeKind.Player;
  return player;
}

export function spawnBoss(def: BossDef, x: number, z: number): EntityId {
  const boss = spawn();
  add(boss, BOSS);
  place(boss, x, z);
  Health.hp[boss] = Health.max[boss] = def.hp;
  Team.id[boss] = TeamId.Enemy;
  Collider.radius[boss] = def.radius;
  Shape.kind[boss] = ShapeKind.Boss;
  BossStyle.kind[boss] = def.style;
  BossPace.pace[boss] = def.pace;
  BossPhase.phase[boss] = 1;
  // From the boss's actual hp, so changing how hp is set can't desync the two.
  Pressure.hpMark[boss] = Health.hp[boss];
  Pressure.markedAt[boss] = world.tick;
  Pressure.evadeReadyAt[boss] = after(def.evadeGrace);
  return boss;
}

export function spawnPillar(x: number, z: number, radius: Meters): EntityId {
  const pillar = spawn();
  add(pillar, PILLAR);
  place(pillar, x, z);
  Collider.radius[pillar] = radius;
  Shape.kind[pillar] = ShapeKind.Pillar;
  return pillar;
}

// Placed where its orbit starts, so the first frame already agrees with orbitSystem.
export function spawnOrbitingPillar(cx: number, cz: number, def: OrbitDef, radius: Meters): EntityId {
  const pillar = spawnPillar(cx + Math.cos(def.angle) * def.radius, cz + Math.sin(def.angle) * def.radius, radius);
  add(pillar, C.Orbiting);
  Orbit.cx[pillar] = cx;
  Orbit.cz[pillar] = cz;
  Orbit.radius[pillar] = def.radius;
  Orbit.angle[pillar] = def.angle;
  Orbit.speed[pillar] = def.speed;
  return pillar;
}

export function spawnProjectile(
  x: number, z: number, dirX: number, dirZ: number, speed: number,
  team: number, owner: Handle, dmg: Hp, life: Seconds, kind: number,
): EntityId {
  const projectile = spawn();
  add(projectile, PROJECTILE);
  place(projectile, x, z);
  Velocity.x[projectile] = dirX * speed;
  Velocity.z[projectile] = dirZ * speed;
  Team.id[projectile] = team;
  Projectile.owner[projectile] = owner;
  Projectile.dmg[projectile] = dmg;
  Projectile.life[projectile] = life;
  Shape.kind[projectile] = kind;
  return projectile;
}

// Spawns on the ground; equipping is a pickup like any other. Level 1 is a
// default for tests and tools; the game's own spawns (stock, gifts, the spawn
// projection) always say which level, since that's the arena's.
export function spawnWeapon(kind: number, x: number, z: number, level = 1): EntityId {
  const weapon = spawn();
  add(weapon, ITEM);
  place(weapon, x, z);
  const def = WEAPONS[kind];
  Item.kind[weapon] = kind;
  Item.pickupAt[weapon] = world.tick;
  Item.level[weapon] = level;
  Durability.value[weapon] = def.durability;
  Ammo.count[weapon] = def.mag;
  Ammo.reload[weapon] = 0;
  Team.id[weapon] = TeamId.Neutral;
  Shape.kind[weapon] = WEAPON_SHAPE[kind];
  return weapon;
}

export function spawnBuff(kind: number, x: number, z: number): EntityId {
  const buff = spawn();
  add(buff, BUFF);
  place(buff, x, z);
  BuffPickup.kind[buff] = kind;
  Shape.kind[buff] = BUFF_SHAPE[kind];
  return buff;
}

export function spawnPerk(kind: number, x: number, z: number): EntityId {
  const perk = spawn();
  add(perk, PERK);
  place(perk, x, z);
  PerkPickup.kind[perk] = kind;
  Shape.kind[perk] = ShapeKind.Perk;
  return perk;
}

export function spawnReward(option: number, kind: number, x: number, z: number): EntityId {
  const reward = spawn();
  add(reward, REWARD);
  place(reward, x, z);
  RewardPickup.option[reward] = option;
  RewardPickup.kind[reward] = kind;
  Shape.kind[reward] = ShapeKind.Reward;
  return reward;
}
