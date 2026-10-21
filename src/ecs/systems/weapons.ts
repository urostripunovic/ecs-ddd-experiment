// Weapons are entities in exactly one state: Grounded, Held, Flying or Stuck.
// Equipping, wear and throwing are pure simulation: no rule or save reacts to
// them yet, so none of this crosses the bridge. Promote it when one does.
import {
  Ammo, Arena, Buffs, BuffPickup, C, Collider, Durability, GodMode, Item, PerkPickup, RunStatus, RunView, PlayerInput,
  Shake, ShapeKind, Stock, StuckIn, Team, TeamId, Thrown, Transform, Velocity, Wielder,
} from '../components';
import { buf, helperBuf, itemBuf, solidBuf, targetBuf } from '../core/buffers';
import { random } from '../core/rng';
import { after, inTicks, seconds, ticks, times, type Seconds, type Ticks } from '../core/units';
import {
  add, despawn, entityAt, handleAt, has, indexOf, isLive, mask, NOBODY, query, remove, toHandle, world,
  type EntityId,
} from '../core/world';
import { spawnBuff, spawnProjectile, spawnWeapon } from '../prefabs';
import {
  BUFF_TICKS, BuffKind, BURN_TICKS, CATCH_HASTE_TICKS, levelDmgMul, RAIL_VENT, RESPAWN_TICKS, RETURN_TICKS, SMASH_RADIUS,
  WEAPON_STOCK, WEAPONS, WeaponKind, weaponLevelFor, type WeaponDef,
} from '../weapons/defs';
import { CHARGE_MAX_TICKS, ChargeZone, throwCharge, type ThrowCharge } from '../weapons/charge';
import { controlsLocked } from './cutscene';
import { hurt } from './damage';
import { dmgMul } from './status';
import { randomClearSpot } from './spots';
import { fireBeam, ignite } from './specials';
import {
  addPerk, FINAL_SHOT_BLOWUP_DMG, hasPerk, LONG_REACH_MUL, Perk, RICOCHET_BOUNCES, RICOCHET_DMG_MUL,
} from './perks';

const WIELDERS = mask(C.Wielder, C.Transform);
const HELD_ITEMS = mask(C.Item, C.Held);
const FLYING_ITEMS = mask(C.Item, C.Flying, C.Transform);
const GROUNDED = mask(C.Grounded, C.Transform);
const STUCK_ITEMS = mask(C.Item, C.Stuck);
const NOT_HELD = mask(C.Grounded, C.Flying, C.Stuck);
const NOT_GROUNDED = mask(C.Held, C.Flying, C.Stuck);
const TARGETS = mask(C.Health, C.Transform, C.Team, C.Collider);
// Blades and throws pass under anything mid-jump.
const UNHITTABLE = mask(C.Dead, C.Airborne);
const SOLIDS = mask(C.Transform, C.Collider, C.Solid);
const BOSSES = mask(C.Boss, C.Transform);

const PICKUP_RADIUS = 1.3;
const DROP_LOCK_TICKS = ticks(45);  // long enough to walk off what you just dropped
const RELEASE_LOCK_TICKS = ticks(20);
const RELEASE_PUSH = 1.0; // knocked clear of the boss, so you don't have to stand inside its slam to grab it
const SWING_TICKS = ticks(10);
const BULLET_SPEED = 30;
const THROWN_RADIUS = 0.45;
const DROP_EVERY_TICKS = inTicks(seconds(7));
const BULLET_LIFE = seconds(1.5);
const MAX_ON_GROUND = 4;
// How close a chakram coming home must get to be caught.
const CATCH_RADIUS = 1.0;
const SMASH_SHAKE = 0.35;
// How long the flame shows after a tick of spraying, for the renderer.
const SPRAY_SHOWN_TICKS = 2;

const fighting = () => RunView.status === RunStatus.Fighting;

export function heldItem(w: EntityId): EntityId | -1 {
  const h = handleAt(Wielder.held, w);
  return isLive(h) ? indexOf(h) : -1;
}

export const defOf = (item: EntityId | -1): WeaponDef => WEAPONS[item === -1 ? WeaponKind.Fists : Item.kind[item]];

// What the item's level adds to every hit it deals; fists have none.
const levelMul = (item: EntityId | -1): number => (item === -1 ? 1 : levelDmgMul(Item.level[item]));

// The one place a weapon loses durability, so the dev menu's "keep weapons" holds everywhere.
function wear(item: EntityId, amount: number): void {
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
function putOnGround(item: EntityId, x: number, z: number, lock: Ticks): void {
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

function breakItem(item: EntityId): void {
  const h = toHandle(item);
  const n = query(helperBuf, C.Wielder);
  for (let i = 0; i < n; i++) {
    const w = entityAt(helperBuf, i);
    if (Wielder.held[w] === h) Wielder.held[w] = NOBODY;
  }
  despawn(item);
}

// Ricochet: mirror the velocity off the surface, step back off it, and fly on
// harder, with a fresh flight time.
function bounce(item: EntityId, nx: number, nz: number): void {
  const along = Velocity.x[item] * nx + Velocity.z[item] * nz;
  if (along < 0) {
    Velocity.x[item] -= 2 * along * nx;
    Velocity.z[item] -= 2 * along * nz;
  }
  const edge = Arena.half - 0.3;
  Transform.x[item] = Math.max(-edge, Math.min(edge, Transform.x[item] + nx * 0.3));
  Transform.z[item] = Math.max(-edge, Math.min(edge, Transform.z[item] + nz * 0.3));
  Thrown.bounces[item]--;
  Thrown.dmg[item] *= RICOCHET_DMG_MUL;
  Thrown.ticksLeft[item] = defOf(item).throwTicks;
}

// A thrown weapon that hits lodges in its target and rides along with it.
function stick(item: EntityId, host: EntityId): void {
  remove(item, C.Flying);
  add(item, C.Stuck);
  Velocity.x[item] = Velocity.z[item] = 0;
  StuckIn.host[item] = toHandle(host);
  StuckIn.angle[item] = Math.atan2(Transform.z[item] - Transform.z[host], Transform.x[item] - Transform.x[host]);
}

// Drops everything lodged in a host, just outside its body. Uses itemBuf, not
// helperBuf, because putOnGround queries helperBuf inside this loop.
export function releaseStuck(host: EntityId): void {
  const h = toHandle(host);
  const n = query(itemBuf, STUCK_ITEMS);
  for (let i = 0; i < n; i++) {
    const it = entityAt(itemBuf, i);
    if (StuckIn.host[it] !== h) continue;
    const a = StuckIn.angle[it];
    const r = Collider.radius[host] + RELEASE_PUSH;
    putOnGround(it, Transform.x[host] + Math.cos(a) * r, Transform.z[host] + Math.sin(a) * r, RELEASE_LOCK_TICKS);
  }
}

// reads StuckIn, host Transform | writes Transform of stuck items; drops them if the host dies
export function stuckFollowSystem(): void {
  const n = query(buf, STUCK_ITEMS);
  for (let i = 0; i < n; i++) {
    const it = entityAt(buf, i);
    const host = handleAt(StuckIn.host, it);
    if (!isLive(host) || has(indexOf(host), C.Dead)) {
      putOnGround(it, Transform.x[it], Transform.z[it], RELEASE_LOCK_TICKS);
      continue;
    }
    const h = indexOf(host);
    const r = Collider.radius[h];
    Transform.x[it] = Transform.x[h] + Math.cos(StuckIn.angle[it]) * r;
    Transform.z[it] = Transform.z[h] + Math.sin(StuckIn.angle[it]) * r;
  }
}

// reads Wielder, Transform | writes Transform of held items
// Held items sit at their wielder so a throw or a drop starts from the right place.
export function heldFollowSystem(): void {
  const n = query(buf, WIELDERS);
  for (let i = 0; i < n; i++) {
    const w = entityAt(buf, i);
    const item = heldItem(w);
    if (item === -1) continue;
    Transform.x[item] = Transform.x[w];
    Transform.z[item] = Transform.z[w];
  }
}

// reads PlayerInput.throwHeld/throwReleases, Wielder, Perks, Ammo, Item.level | writes Wielder.charge, Thrown, Velocity, item state;
// with Final shot instead: Ammo, Shake, Health (via hurt), spawns a heavy bullet or breaks the gun
// Holding fills the gauge; the release throws with whatever it reached, so a
// tap is a weak throw and timing the perfect zone is the skill.
export function throwSystem(): void {
  const n = query(buf, WIELDERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const w = entityAt(buf, i);
    const released = PlayerInput.throwReleases !== Wielder.throwSeen[w];
    Wielder.throwSeen[w] = PlayerInput.throwReleases;
    const item = heldItem(w);
    if (controlsLocked() || item === -1) { Wielder.charge[w] = 0; continue; }
    if (!released) {
      if (PlayerInput.throwHeld && Wielder.charge[w] < CHARGE_MAX_TICKS) Wielder.charge[w]++;
      continue;
    }

    const def = defOf(item);
    const charge = throwCharge(Wielder.charge[w] / CHARGE_MAX_TICKS);
    Wielder.charge[w] = 0;
    if (Item.kind[item] === WeaponKind.Gun && Ammo.count[item] > 0 && hasPerk(w, Perk.FinalShot)) {
      finalShot(w, item, charge);
      continue;
    }
    const start = Collider.radius[w] + 0.5;
    const speed = def.throwSpeed * charge.speedMul;
    remove(item, C.Held);
    add(item, C.Flying);
    Transform.x[item] = Transform.px[item] = Transform.x[w] + PlayerInput.aimX * start;
    Transform.z[item] = Transform.pz[item] = Transform.z[w] + PlayerInput.aimZ * start;
    Velocity.x[item] = PlayerInput.aimX * speed;
    Velocity.z[item] = PlayerInput.aimZ * speed;
    Thrown.by[item] = toHandle(w);
    Thrown.dmg[item] = def.throwDmg * dmgMul(w) * charge.dmgMul * levelMul(item);
    Thrown.wearMul[item] = charge.wearMul;
    Thrown.ticksLeft[item] = def.throwTicks;
    Thrown.bounces[item] = Item.kind[item] === WeaponKind.Sword && hasPerk(w, Perk.Ricochet) ? RICOCHET_BOUNCES : 0;
    Thrown.leg[item] = 0;
    Thrown.lastHit[item] = NOBODY;
    Wielder.held[w] = NOBODY;
  }
}

// Final shot: the rest of the magazine leaves as one heavy shot, as hard as the
// gauge says. Past the gauge's end the gun can't take it: it blows up in your
// hands, hurting you, and is gone (the stock brings a new one later).
function finalShot(wielder: EntityId, gun: EntityId, charge: ThrowCharge): void {
  const def = defOf(gun);
  if (charge.zone === ChargeZone.Overcharged) {
    // Shake has several writers (the roar, this) on purpose: each only raises it and
    // shakeSystem decays it, so the strongest shake wins and none erases another.
    Shake.trauma = Math.max(Shake.trauma, 0.6);
    hurt(wielder, FINAL_SHOT_BLOWUP_DMG, toHandle(wielder));
    breakItem(gun);
    return;
  }
  const muzzle = Collider.radius[wielder] + 0.35;
  spawnProjectile(
    Transform.x[wielder] + PlayerInput.aimX * muzzle, Transform.z[wielder] + PlayerInput.aimZ * muzzle,
    PlayerInput.aimX, PlayerInput.aimZ, BULLET_SPEED,
    Team.id[wielder], toHandle(wielder), times(def.dmg, Ammo.count[gun] * charge.dmgMul * dmgMul(wielder) * levelMul(gun)),
    BULLET_LIFE,
    ShapeKind.HeavyBullet,
  );
  Ammo.count[gun] = 0;
  Ammo.reload[gun] = def.reloadTime;
}

function reachOf(wielder: EntityId, def: WeaponDef): number {
  const item = heldItem(wielder);
  const spear = item !== -1 && Item.kind[item] === WeaponKind.Spear;
  return spear && hasPerk(wielder, Perk.LongReach) ? def.reach * LONG_REACH_MUL : def.reach;
}

// Every target in reach and inside the arc, so one sword swing can hit several.
function meleeHit(w: EntityId, def: WeaponDef): boolean {
  const reach = reachOf(w, def);
  let hit = false;
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[w]) continue;
    const dx = Transform.x[t] - Transform.x[w];
    const dz = Transform.z[t] - Transform.z[w];
    const d = Math.hypot(dx, dz);
    if (d > reach + Collider.radius[t]) continue;
    // Measured to the target's centre; a target you are touching is always in the arc.
    if (d > Collider.radius[t] && (dx * PlayerInput.aimX + dz * PlayerInput.aimZ) / d < def.arcCos) continue;
    hurt(t, def.dmg * dmgMul(w) * levelMul(heldItem(w)), toHandle(w));
    hit = true;
  }
  return hit;
}

// The railgun: holding fire fills the gauge, the release fires. Perfect hits
// hardest; overcharged, it overheats and vents instead of firing.
function railgun(w: EntityId, gun: EntityId, def: WeaponDef, released: boolean): void {
  if (controlsLocked()) { Wielder.fireCharge[w] = 0; return; }
  if (!released) {
    if (PlayerInput.fire && Wielder.fireCharge[w] < CHARGE_MAX_TICKS) Wielder.fireCharge[w]++;
    return;
  }
  const fill = Wielder.fireCharge[w] / CHARGE_MAX_TICKS;
  Wielder.fireCharge[w] = 0;
  if (fill === 0) return;
  const charge = throwCharge(fill);
  if (charge.zone === ChargeZone.Overcharged) { Ammo.reload[gun] = RAIL_VENT; return; }
  if (!(import.meta.env.DEV && GodMode.keepWeapons)) Ammo.count[gun]--;
  if (Ammo.count[gun] === 0) Ammo.reload[gun] = def.reloadTime;
  Wielder.swing[w] = SWING_TICKS;
  const muzzle = Collider.radius[w] + 0.35;
  fireBeam(
    Transform.x[w] + PlayerInput.aimX * muzzle, Transform.z[w] + PlayerInput.aimZ * muzzle, PlayerInput.aimX, PlayerInput.aimZ,
    Team.id[w], toHandle(w), def.dmg * charge.dmgMul * dmgMul(w) * levelMul(gun),
  );
}

// The flamethrower: while fire is held, everything in the cone catches (or keeps
// burning), and fuel goes. The burn does the damage, so stepping out of the
// cone doesn't put you out.
function spray(w: EntityId, flamer: EntityId, def: WeaponDef, dt: Seconds): void {
  if (controlsLocked() || !PlayerInput.fire) return;
  Wielder.swing[w] = SPRAY_SHOWN_TICKS;
  wear(flamer, def.fuelPerSec * dt);
  const dps = def.dmg * dmgMul(w) * levelMul(flamer);
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[w]) continue;
    const dx = Transform.x[t] - Transform.x[w];
    const dz = Transform.z[t] - Transform.z[w];
    const d = Math.hypot(dx, dz);
    if (d > def.reach + Collider.radius[t]) continue;
    if (d > Collider.radius[t] && (dx * PlayerInput.aimX + dz * PlayerInput.aimZ) / d < def.arcCos) continue;
    ignite(t, dps, after(BURN_TICKS), toHandle(w));
  }
}

// reads PlayerInput (fire, fireReleases), RunView, Wielder, held item and its level | writes Wielder, Ammo, Durability,
// Health, Burn; spawns bullets and railgun tracers
export function attackSystem(dt: Seconds): void {
  const n = query(buf, WIELDERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const w = entityAt(buf, i);
    // Caught up every tick, whatever is in hand, so a release from before you
    // picked up the railgun never fires it.
    const released = PlayerInput.fireReleases !== Wielder.fireSeen[w];
    Wielder.fireSeen[w] = PlayerInput.fireReleases;
    Wielder.cooldown[w] = Math.max(0, Wielder.cooldown[w] - dt);
    if (Wielder.swing[w] > 0) Wielder.swing[w]--;
    const item = heldItem(w);
    const def = defOf(item);
    if (def.attack !== 'rail') Wielder.fireCharge[w] = 0;

    // Anything with a magazine reloads the same way; a railgun's vent is a reload too.
    if (def.mag > 0 && item !== -1) {
      if (Ammo.reload[item] > 0) {
        Ammo.reload[item] -= dt;
        if (Ammo.reload[item] <= 0) { Ammo.reload[item] = 0; Ammo.count[item] = def.mag; }
        Wielder.fireCharge[w] = 0;
        continue;
      }
      if (PlayerInput.reload && Ammo.count[item] < def.mag) {
        Ammo.reload[item] = def.reloadTime;
        Wielder.fireCharge[w] = 0;
        continue;
      }
    }
    if (def.attack === 'rail' && item !== -1) { railgun(w, item, def, released); continue; }
    if (def.attack === 'spray' && item !== -1) { spray(w, item, def, dt); continue; }
    if (controlsLocked() || !PlayerInput.fire || Wielder.cooldown[w] > 0) continue;
    Wielder.cooldown[w] = def.cooldown;

    if (def.attack === 'shoot' && item !== -1) {
      if (!(import.meta.env.DEV && GodMode.keepWeapons)) Ammo.count[item]--;
      if (Ammo.count[item] === 0) Ammo.reload[item] = def.reloadTime;
      // Spawned at the muzzle, not the centre, so point-blank shots still read as leaving the gun.
      const muzzle = Collider.radius[w] + 0.35;
      const aim = Math.atan2(PlayerInput.aimZ, PlayerInput.aimX);
      for (let k = 0; k < def.pellets; k++) {
        const a = def.pellets === 1 ? aim : aim - def.spread + (2 * def.spread * k) / (def.pellets - 1);
        spawnProjectile(
          Transform.x[w] + PlayerInput.aimX * muzzle, Transform.z[w] + PlayerInput.aimZ * muzzle,
          Math.cos(a), Math.sin(a), BULLET_SPEED,
          Team.id[w], toHandle(w), times(def.dmg, dmgMul(w) * levelMul(item)), BULLET_LIFE, ShapeKind.Bullet,
        );
      }
      continue;
    }
    Wielder.swing[w] = SWING_TICKS;
    // Wear once per swing that connects, not per target, so crowds don't shred a blade.
    if (meleeHit(w, def) && item !== -1) wear(item, def.wearPerHit);
  }
}

// reads Thrown, Transform, Team, Collider | writes Health, Durability, item state, Shake (a smash), Buffs (a caught
// chakram); a chakram coming home writes Velocity, Thrown.leg/lastHit; a ricochet writes Velocity,
// Transform, Thrown.dmg/ticksLeft/bounces
// A hit lodges the weapon in the target; a miss lands it, locked for a while.
export function flightSystem(): void {
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  const solids = query(solidBuf, SOLIDS, C.Dead);
  const n = query(buf, FLYING_ITEMS);
  for (let i = 0; i < n; i++) {
    const f = entityAt(buf, i);
    const style = defOf(f).throwStyle;
    if (style === 'return') { flyChakram(f, targets, solids); continue; }
    const x = Transform.x[f];
    const z = Transform.z[f];
    let landed = false;
    let struck: EntityId | -1 = -1;

    for (let j = 0; j < targets && struck === -1; j++) {
      const t = entityAt(targetBuf, j);
      if (Team.id[t] === Team.id[f]) continue;
      const r = Collider.radius[t] + THROWN_RADIUS;
      const dx = Transform.x[t] - x;
      const dz = Transform.z[t] - z;
      if (dx * dx + dz * dz > r * r) continue;
      struck = t;
    }
    // A hammer doesn't hit what it touches: it comes down there, and the smash does the hurting.
    if (struck !== -1 && style === 'smash') { smash(f, targets); continue; }
    if (struck !== -1) {
      hurt(struck, Thrown.dmg[f], handleAt(Thrown.by, f));
      wear(f, defOf(f).throwWear * Thrown.wearMul[f]);
      stick(f, struck);
      continue;
    }
    // The surface it hit, if any, so a ricochet knows which way to bounce.
    let nx = 0;
    let nz = 0;
    for (let j = 0; j < solids && !landed; j++) {
      const s = entityAt(solidBuf, j);
      if (has(s, C.Health)) continue;
      const r = Collider.radius[s] + 0.2;
      const dx = x - Transform.x[s];
      const dz = z - Transform.z[s];
      if (dx * dx + dz * dz > r * r) continue;
      landed = true;
      const d = Math.hypot(dx, dz) || 1;
      nx = dx / d;
      nz = dz / d;
    }
    const edge = Arena.half - 0.3;
    if (Math.abs(x) > edge) { landed = true; nx = -Math.sign(x); }
    if (Math.abs(z) > edge) { landed = true; nz = -Math.sign(z); }
    if (landed && Thrown.bounces[f] > 0) {
      bounce(f, nx, nz);
      landed = false;
    }
    if (Thrown.ticksLeft[f] > 0) Thrown.ticksLeft[f]--;
    if (Thrown.ticksLeft[f] === 0) landed = true;

    if (landed && style === 'smash') smash(f, targets);
    else if (landed) putOnGround(f, x, z, defOf(f).throwLockTicks);
  }
}

// The warhammer coming down: everything of the other side within the radius is
// hit once, and loses whatever was lodged in it. Reads the targets flightSystem
// already gathered in targetBuf.
function smash(hammer: EntityId, targets: number): void {
  const x = Transform.x[hammer];
  const z = Transform.z[hammer];
  const by = handleAt(Thrown.by, hammer);
  let hit = false;
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[hammer]) continue;
    const r = SMASH_RADIUS + Collider.radius[t];
    const dx = Transform.x[t] - x;
    const dz = Transform.z[t] - z;
    if (dx * dx + dz * dz > r * r) continue;
    hurt(t, Thrown.dmg[hammer], by);
    releaseStuck(t);
    hit = true;
  }
  if (hit) wear(hammer, defOf(hammer).throwWear * Thrown.wearMul[hammer]);
  // Shake has several writers on purpose: each only raises it (see finalShot).
  Shake.trauma = Math.max(Shake.trauma, SMASH_SHAKE);
  putOnGround(hammer, x, z, defOf(hammer).throwLockTicks);
}

// The chakram: out along the throw, through whatever it hits, then home. Each
// leg hits a target once. It turns at the end of its flight or on stone, and
// on the way home it flies over everything to the thrower's hand, or lands
// at their feet if their hands are full by then.
function flyChakram(f: EntityId, targets: number, solids: number): void {
  const x = Transform.x[f];
  const z = Transform.z[f];
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[f] || Thrown.lastHit[f] === toHandle(t)) continue;
    const r = Collider.radius[t] + THROWN_RADIUS;
    const dx = Transform.x[t] - x;
    const dz = Transform.z[t] - z;
    if (dx * dx + dz * dz > r * r) continue;
    hurt(t, Thrown.dmg[f], handleAt(Thrown.by, f));
    wear(f, defOf(f).throwWear * Thrown.wearMul[f]);
    Thrown.lastHit[f] = toHandle(t);
  }
  if (Thrown.ticksLeft[f] > 0) Thrown.ticksLeft[f]--;

  if (Thrown.leg[f] === 0) {
    let turn = Thrown.ticksLeft[f] === 0;
    for (let j = 0; j < solids && !turn; j++) {
      const s = entityAt(solidBuf, j);
      if (has(s, C.Health)) continue;
      const r = Collider.radius[s] + 0.2;
      const dx = x - Transform.x[s];
      const dz = z - Transform.z[s];
      if (dx * dx + dz * dz <= r * r) turn = true;
    }
    const edge = Arena.half - 0.3;
    if (Math.abs(x) > edge || Math.abs(z) > edge) turn = true;
    if (!turn) return;
    Thrown.leg[f] = 1;
    Thrown.lastHit[f] = NOBODY;
    Thrown.ticksLeft[f] = RETURN_TICKS;
  }

  const thrower = handleAt(Thrown.by, f);
  if (!isLive(thrower) || has(indexOf(thrower), C.Dead) || Thrown.ticksLeft[f] === 0) {
    putOnGround(f, x, z, defOf(f).throwLockTicks);
    return;
  }
  const w = indexOf(thrower);
  const dx = Transform.x[w] - x;
  const dz = Transform.z[w] - z;
  const d = Math.hypot(dx, dz);
  if (d <= CATCH_RADIUS) {
    if (heldItem(w) !== -1) { putOnGround(f, Transform.x[w], Transform.z[w], DROP_LOCK_TICKS); return; }
    Thrown.lastHit[f] = NOBODY;
    equip(w, f);
    // Haste has two writers, pickups and this; each only pushes the deadline
    // later, so neither can cut the other short.
    Buffs.hasteUntil[w] = Math.max(Buffs.hasteUntil[w], after(CATCH_HASTE_TICKS));
    return;
  }
  const speed = defOf(f).throwSpeed;
  Velocity.x[f] = (dx / d) * speed;
  Velocity.z[f] = (dz / d) * speed;
}

// Whether this wielder has a chakram in the air. Uses solidBuf, which nothing
// holds across pickupSystem's loop.
function chakramOut(w: EntityId): boolean {
  const h = toHandle(w);
  const n = query(solidBuf, FLYING_ITEMS);
  for (let i = 0; i < n; i++) {
    const f = entityAt(solidBuf, i);
    if (Thrown.by[f] === h && defOf(f).throwStyle === 'return') return true;
  }
  return false;
}

function applyBuff(w: EntityId, kind: number): void {
  if (kind === BuffKind.Haste) Buffs.hasteUntil[w] = after(BUFF_TICKS);
  else if (kind === BuffKind.Fury) Buffs.furyUntil[w] = after(BUFF_TICKS);
}

// reads Grounded items, PlayerInput.interactPresses, Wielder, flying chakrams | writes Wielder, Buffs, Perks, item state
// Empty hands pick up by walking over; full hands swap only on purpose (interact).
export function pickupSystem(): void {
  if (controlsLocked()) return;
  const items = query(itemBuf, GROUNDED);
  const n = query(buf, WIELDERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const w = entityAt(buf, i);
    const interact = PlayerInput.interactPresses !== Wielder.interactSeen[w];
    Wielder.interactSeen[w] = PlayerInput.interactPresses;

    let nearest: EntityId | -1 = -1;
    let best = PICKUP_RADIUS * PICKUP_RADIUS;
    for (let j = 0; j < items; j++) {
      const it = entityAt(itemBuf, j);
      // A buff consumed earlier in this loop is gone; an item picked up is no longer on the ground.
      if (!world.inUse[it] || !has(it, C.Grounded)) continue;
      const dx = Transform.x[it] - Transform.x[w];
      const dz = Transform.z[it] - Transform.z[w];
      const d2 = dx * dx + dz * dz;
      if (d2 > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      if (has(it, C.BuffPickup)) { applyBuff(w, BuffPickup.kind[it]); despawn(it); continue; }
      if (has(it, C.PerkPickup)) { addPerk(w, PerkPickup.kind[it]); despawn(it); continue; }
      if (world.tick < Item.pickupAt[it] || d2 >= best) continue;
      nearest = it;
      best = d2;
    }
    if (nearest === -1) continue;

    const holding = heldItem(w);
    // A chakram you threw still has your hand: walking over something else
    // mustn't fill it before it comes home. A swap (interact) still does.
    if (holding === -1 && !interact && chakramOut(w)) continue;
    if (holding === -1) equip(w, nearest);
    else if (interact) {
      putOnGround(holding, Transform.x[w], Transform.z[w], DROP_LOCK_TICKS);
      equip(w, nearest);
    }
  }
}

// reads Held items, Durability, RunView | writes Durability; breaks worn-out items wherever they are
export function durabilitySystem(dt: Seconds): void {
  // Time stops wearing things once the fight is over, so the end screen shows what you finished with.
  const held = fighting() ? query(buf, HELD_ITEMS) : 0;
  for (let i = 0; i < held; i++) {
    const it = entityAt(buf, i);
    wear(it, defOf(it).decayPerSec * dt);
  }
  const n = query(buf, C.Item);
  for (let i = 0; i < n; i++) {
    const it = entityAt(buf, i);
    if (defOf(it).durability > 0 && Durability.value[it] <= 0) breakItem(it);
  }
}

const spot = { x: 0, z: 0 };


const stockCounts = new Int32Array(WEAPONS.length);

// reads every Item (any state), Stock (and its special), RunView.arena | writes Stock; spawns replacements at the arena's level
// Keeps WEAPON_STOCK of each kind in play. A missing one is scheduled when it
// is first noticed and appears RESPAWN_TICKS later, so breaking a blade costs
// you time, never the weapon for good.
export function stockSystem(): void {
  if (!fighting()) return;
  stockCounts.fill(0);
  const n = query(helperBuf, C.Item);
  for (let i = 0; i < n; i++) stockCounts[Item.kind[entityAt(helperBuf, i)]]++;

  for (let kind = 1; kind < WEAPONS.length; kind++) {
    const want = WEAPON_STOCK[kind] + (kind === Stock.special ? 1 : 0);
    if (stockCounts[kind] >= want) { Stock.respawnAt[kind] = 0; continue; }
    if (Stock.respawnAt[kind] === 0) { Stock.respawnAt[kind] = after(RESPAWN_TICKS); continue; }
    if (world.tick < Stock.respawnAt[kind]) continue;
    // No clear spot this tick (rare): try again next tick rather than spawn somewhere bad.
    if (!randomClearSpot(spot)) continue;
    spawnWeapon(kind, spot.x, spot.z, weaponLevelFor(RunView.arena));
    Stock.respawnAt[kind] = 0;
  }
}

// reads world.tick, rng, Grounded count | spawns buffs
// Weapons are kept stocked by stockSystem; this only scatters buffs.
export function dropSystem(): void {
  if (!fighting() || world.tick === 0 || world.tick % DROP_EVERY_TICKS !== 0) return;
  if (query(helperBuf, GROUNDED) >= MAX_ON_GROUND) return;
  if (query(helperBuf, BOSSES, C.Dead) === 0) return;

  const roll = random();
  if (!randomClearSpot(spot)) return;
  spawnBuff(roll < 0.5 ? BuffKind.Haste : BuffKind.Fury, spot.x, spot.z);
}
