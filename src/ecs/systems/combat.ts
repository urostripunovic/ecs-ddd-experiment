import {
  C, Collider, Health, Hurt, LastHit, MatchStatus, MatchView, PlayerInput, Projectile, ShapeKind,
  Team, Transform, Velocity, Weapon,
} from '../components';
import { buf, targetBuf } from '../core/buffers';
import { send } from '../core/outbox';
import { add, despawn, entityAt, handleAt, mask, query, remove, toHandle } from '../core/world';
import { spawnProjectile } from '../prefabs';
import { stopScript } from './boss';
import { hurt } from './damage';

export const PROJECTILE_SPEED = 30;
// Bullets have no collider of their own; this is their radius against a target's.
const BULLET_RADIUS = 0.2;

const SHOOTERS = mask(C.Weapon, C.Transform, C.PlayerControlled);
const TARGETS = mask(C.Health, C.Transform, C.Team, C.Collider);
const PROJECTILES = mask(C.Projectile, C.Transform, C.Team);

// reads PlayerInput, MatchView, Weapon, Transform, Team | writes Weapon, spawns Projectile
export function fireSystem(dt: number): void {
  const active = MatchView.status === MatchStatus.Fighting;
  const n = query(buf, SHOOTERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    Weapon.cooldown[e] = Math.max(0, Weapon.cooldown[e] - dt);

    if (Weapon.reload[e] > 0) {
      Weapon.reload[e] -= dt;
      if (Weapon.reload[e] <= 0) { Weapon.reload[e] = 0; Weapon.ammo[e] = Weapon.mag[e]; }
      continue;
    }
    if (PlayerInput.reload && Weapon.ammo[e] < Weapon.mag[e]) { Weapon.reload[e] = Weapon.reloadTime[e]; continue; }
    if (!active || !PlayerInput.fire || Weapon.cooldown[e] > 0) continue;

    Weapon.cooldown[e] = 1 / Weapon.rate[e];
    Weapon.ammo[e]--;
    if (Weapon.ammo[e] === 0) Weapon.reload[e] = Weapon.reloadTime[e];

    // Spawned at the muzzle, not the centre, so point-blank shots still read as leaving the gun.
    const muzzle = Collider.radius[e] + 0.35;
    spawnProjectile(
      Transform.x[e] + PlayerInput.aimX * muzzle, Transform.z[e] + PlayerInput.aimZ * muzzle,
      PlayerInput.aimX, PlayerInput.aimZ, PROJECTILE_SPEED,
      Team.id[e], toHandle(e), Weapon.dmg[e], 1.5, ShapeKind.Bullet,
    );
  }
}

// reads Projectile, Transform, Team, Collider | writes Health, Hurt, LastHit, despawns Projectile
export function projectileSystem(dt: number): void {
  const targets = query(targetBuf, TARGETS, C.Dead);
  const n = query(buf, PROJECTILES);
  for (let i = 0; i < n; i++) {
    const p = entityAt(buf, i);
    Projectile.life[p] -= dt;
    if (Projectile.life[p] <= 0) { despawn(p); continue; }

    for (let j = 0; j < targets; j++) {
      const t = entityAt(targetBuf, j);
      if (Team.id[t] === Team.id[p]) continue;
      const dx = Transform.x[t] - Transform.x[p];
      const dz = Transform.z[t] - Transform.z[p];
      const r = Collider.radius[t] + BULLET_RADIUS;
      if (dx * dx + dz * dz > r * r) continue;

      hurt(t, Projectile.dmg[p], handleAt(Projectile.owner, p));
      despawn(p);
      break;
    }
  }
}

// reads Hurt | writes Hurt
export function hurtFlashSystem(): void {
  const n = query(buf, C.Health);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (Hurt.flash[e] > 0) Hurt.flash[e]--;
  }
}

// reads Health | writes Dead tag, Velocity, sends EntityDowned
// Edge-triggered: the Dead tag excludes the entity next tick, so the command
// fires exactly once per death instead of every tick that hp <= 0.
export function deathSystem(): void {
  const n = query(buf, C.Health, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (Health.hp[e] > 0) continue;
    Health.hp[e] = 0;
    add(e, C.Dead);
    remove(e, C.Slam);
    stopScript(e);
    Velocity.x[e] = Velocity.z[e] = 0;
    send('EntityDowned', toHandle(e), handleAt(LastHit.by, e), 0);
  }
}
