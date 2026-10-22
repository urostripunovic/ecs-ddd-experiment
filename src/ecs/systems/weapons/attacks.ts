// Pressing fire: swings, shots, the railgun's charged beam and the flamethrower's cone.
import { Ammo, C, Collider, GodMode, PlayerInput, ShapeKind, Team, Transform, Wielder } from '../../components';
import { buf, targetBuf } from '../../core/buffers';
import type { Random } from '../../core/rng';
import { after, times } from '../../core/units';
import type { Seconds } from '../../core/units';
import { entityAt, query, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnProjectile } from '../../prefabs';
import { CHARGE_MAX_TICKS, railBloom, throwCharge } from '../../weapons/charge';
import { BURN_TICKS } from '../../weapons/defs';
import type { WeaponDef } from '../../weapons/defs';
import { controlsLocked } from '../cutscene';
import { hurt } from '../damage';
import { LONG_REACH_MUL, Perk, hasPerk } from '../perks';
import { fireBeam, ignite } from '../specials';
import { dmgMul } from '../status';
import { BULLET_LIFE, BULLET_SPEED, SPRAY_SHOWN_TICKS, SWING_TICKS, TARGETS, UNHITTABLE, WIELDERS, defOf, heldItem, levelMul, wear } from './items';

export function reachOf(wielder: EntityId, def: WeaponDef): number {
  return def.longReach && hasPerk(wielder, Perk.LongReach) ? def.reach * LONG_REACH_MUL : def.reach;
}

// Every target in reach and inside the arc, so one sword swing can hit several.
export function meleeHit(w: EntityId, def: WeaponDef): boolean {
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
// hardest; overcharged, the shot blooms off your aim.
export function railgun(w: EntityId, gun: EntityId, def: WeaponDef, released: boolean, bloomRng: Random): void {
  if (controlsLocked()) { Wielder.fireCharge[w] = 0; return; }
  if (!released) {
    if (PlayerInput.fire && Wielder.fireCharge[w] < CHARGE_MAX_TICKS) Wielder.fireCharge[w]++;
    return;
  }
  const fill = Wielder.fireCharge[w] / CHARGE_MAX_TICKS;
  Wielder.fireCharge[w] = 0;
  if (fill === 0) return;
  const charge = throwCharge(fill);
  if (!(import.meta.env.DEV && GodMode.keepWeapons)) Ammo.count[gun]--;
  if (Ammo.count[gun] === 0) Ammo.reload[gun] = def.reloadTime;
  Wielder.swing[w] = SWING_TICKS;
  // Overcharged, it still fires, at full power, but blooms off your aim like
  // hip-fire: the further into the overcharge, the wider. Seeded, so it replays.
  const bloom = railBloom(fill);
  const off = bloom > 0 ? (bloomRng.next() * 2 - 1) * bloom : 0;
  const aim = Math.atan2(PlayerInput.aimZ, PlayerInput.aimX) + off;
  const dx = Math.cos(aim);
  const dz = Math.sin(aim);
  const muzzle = Collider.radius[w] + 0.35;
  fireBeam(
    Transform.x[w] + dx * muzzle, Transform.z[w] + dz * muzzle, dx, dz,
    Team.id[w], toHandle(w), def.dmg * charge.dmgMul * dmgMul(w) * levelMul(gun),
  );
}

// The flamethrower: while fire is held, everything in the cone catches (or keeps
// burning), and fuel goes. The burn does the damage, so stepping out of the
// cone doesn't put you out.
export function spray(w: EntityId, flamer: EntityId, def: WeaponDef, dt: Seconds): void {
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
// Health, Burn, Orbit.kick (a rail beam stopped by a pillar); spawns bullets and railgun tracers
// bloomRng: where an overcharged railgun shot's bloom is drawn from.
export function attackSystem(dt: Seconds, bloomRng: Random): void {
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
    if (def.attack === 'rail' && item !== -1) { railgun(w, item, def, released, bloomRng); continue; }
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
