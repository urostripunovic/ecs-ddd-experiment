import { C, Collider, Health, Hurt, LastHit, Projectile, Team, Transform, Velocity } from '../components';
import { buf, targetBuf } from '../core/buffers';
import { send } from '../core/outbox';
import type { Seconds } from '../core/units';
import { add, despawn, entityAt, handleAt, mask, query, remove, toHandle } from '../core/world';
import { stopScript } from './boss';
import { hurt } from './damage';

// Bullets have no collider of their own; this is their radius against a target's.
const BULLET_RADIUS = 0.2;

const TARGETS = mask(C.Health, C.Transform, C.Team, C.Collider);
const PROJECTILES = mask(C.Projectile, C.Transform, C.Team);
// Bullets fly under anything mid-jump.
const UNHITTABLE = mask(C.Dead, C.Airborne);
const GONE = mask(C.Slam, C.Airborne, C.Invulnerable);

// reads Projectile, Transform, Team, Collider | writes Health, Hurt, LastHit, despawns Projectile
export function projectileSystem(dt: Seconds): void {
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
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
    remove(e, GONE);
    stopScript(e);
    Velocity.x[e] = Velocity.z[e] = 0;
    send('EntityDowned', toHandle(e), handleAt(LastHit.by, e), 0);
  }
}
