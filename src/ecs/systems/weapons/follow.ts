// Items that ride along with someone: held in a hand, or lodged in a boss.
import { C, Collider, StuckIn, Transform } from '../../components';
import { buf, itemBuf } from '../../core/buffers';
import { entityAt, handleAt, has, indexOf, isLive, query, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { RELEASE_LOCK_TICKS, RELEASE_PUSH, STUCK_ITEMS, WIELDERS, heldItem, putOnGround } from './items';

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
