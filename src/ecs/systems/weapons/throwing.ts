// Holding and letting go of throw: the timed gauge, the warhammer's spin, and the
// Final shot that turns a gun's throw into the rest of its magazine.
import { Ammo, C, Collider, PlayerInput, Shake, ShapeKind, Team, Thrown, Transform, Velocity, Wielder, Dizzy } from '../../components';
import { buf, targetBuf } from '../../core/buffers';
import { times, after, ticks } from '../../core/units';
import { NOBODY, add, entityAt, query, remove, toHandle, world } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnProjectile } from '../../prefabs';
import { CHARGE_MAX_TICKS, ChargeZone, spinThrow, throwCharge } from '../../weapons/charge';
import type { ThrowCharge } from '../../weapons/charge';
import { SPIN_DMG_SHARE, SPIN_HIT_TICKS, SPIN_LIMIT, DIZZY_TICKS } from '../../weapons/defs';
import { controlsLocked } from '../cutscene';
import { hurt } from '../damage';
import { FINAL_SHOT_BLOWUP_DMG, Perk, RICOCHET_BOUNCES, hasPerk } from '../perks';
import { dmgMul } from '../status';
import { BULLET_LIFE, BULLET_SPEED, TARGETS, UNHITTABLE, WIELDERS, breakItem, defOf, emptyHand, heldItem, levelMul, wear } from './items';

// reads PlayerInput.throwHeld/throwReleases, Wielder, Perks, Ammo, Item.level | writes Wielder.charge/spinSince, Thrown,
// Velocity, item state, Dizzy (a hammer spun too long);
// a spinning hammer writes Health (via hurt) and Durability;
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
    const def = defOf(item);
    const spins = def.heldThrow === 'spin';
    if (!released) {
      if (PlayerInput.throwHeld && Wielder.charge[w] === 0) Wielder.spinSince[w] = world.tick;
      if (PlayerInput.throwHeld && Wielder.charge[w] < CHARGE_MAX_TICKS) Wielder.charge[w]++;
      if (spins && spinning(w)) spin(w, item);
      continue;
    }

    // The hammer's gauge is momentum, with no perfect zone; every other throw is timed.
    const fill = Wielder.charge[w] / CHARGE_MAX_TICKS;
    const charge = spins ? spinThrow(fill) : throwCharge(fill);
    if (spins) dizzyIfOverspun(w);
    Wielder.charge[w] = 0;
    if (def.finalShot && Ammo.count[item] > 0 && hasPerk(w, Perk.FinalShot)) {
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
    Thrown.bounces[item] = def.ricochet && hasPerk(w, Perk.Ricochet) ? RICOCHET_BOUNCES : 0;
    Thrown.leg[item] = 0;
    Thrown.lastHit[item] = NOBODY;
    emptyHand(w);
  }
}

// Holding throw with a warhammer spins it round you (decided with the user).
export const spinning = (w: EntityId): boolean => PlayerInput.throwHeld && Wielder.charge[w] > 0;

// A spinning hammer hits everything of the other side within reach, all round
// you, every SPIN_HIT_TICKS, harder as its momentum builds.
export function spin(w: EntityId, hammer: EntityId): void {
  if (world.tick % SPIN_HIT_TICKS !== 0) return;
  const def = defOf(hammer);
  const momentum = spinThrow(Wielder.charge[w] / CHARGE_MAX_TICKS).dmgMul;
  const dmg = def.dmg * SPIN_DMG_SHARE * momentum * dmgMul(w) * levelMul(hammer);
  let hit = false;
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[w]) continue;
    const dx = Transform.x[t] - Transform.x[w];
    const dz = Transform.z[t] - Transform.z[w];
    if (Math.hypot(dx, dz) > def.reach + Collider.radius[t]) continue;
    hurt(t, dmg, toHandle(w));
    hit = true;
  }
  // Half a swing's wear a connecting turn: a long spin costs the hammer.
  if (hit) wear(hammer, def.wearPerHit / 2);
}

// Final shot: the rest of the magazine leaves as one heavy shot, as hard as the
// gauge says. Past the gauge's end the gun can't take it: it blows up in your
// hands, hurting you, and is gone (the stock brings a new one later).
export function finalShot(wielder: EntityId, gun: EntityId, charge: ThrowCharge): void {
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

// Decided with the user: spin past SPIN_LIMIT and letting go leaves you dizzy
// for as long as you overspun, at most as long as breaking it mid-spin does.
function dizzyIfOverspun(w: EntityId): void {
  const over = world.tick - Wielder.spinSince[w] - SPIN_LIMIT;
  if (over <= 0) return;
  Dizzy.until[w] = after(ticks(Math.min(over, DIZZY_TICKS)));
}
