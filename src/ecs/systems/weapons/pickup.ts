// Walking over things: weapons, buffs and perks.
import { BuffPickup, Buffs, C, Item, PerkPickup, PlayerInput, Thrown, Transform, Wielder } from '../../components';
import { buf, itemBuf, solidBuf } from '../../core/buffers';
import { after } from '../../core/units';
import { despawn, entityAt, has, query, toHandle, world } from '../../core/world';
import type { EntityId } from '../../core/world';
import { BUFF_TICKS, BuffKind } from '../../weapons/defs';
import { controlsLocked } from '../cutscene';
import { addPerk } from '../perks';
import { DROP_LOCK_TICKS, FLYING_ITEMS, GROUNDED, PICKUP_RADIUS, WIELDERS, equip, heldItem, putOnGround } from './items';

// Whether this wielder has a chakram in the air. Uses solidBuf, which nothing
// holds across pickupSystem's loop.
export function chakramOut(w: EntityId): boolean {
  const h = toHandle(w);
  const n = query(solidBuf, FLYING_ITEMS);
  for (let i = 0; i < n; i++) {
    const f = entityAt(solidBuf, i);
    if (Thrown.by[f] === h && has(f, C.Returning)) return true;
  }
  return false;
}

export function applyBuff(w: EntityId, kind: number): void {
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
