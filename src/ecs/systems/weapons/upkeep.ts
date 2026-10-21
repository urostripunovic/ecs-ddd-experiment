// What keeps the arena's weapons going: wear and breaking, the stock that
// replaces broken ones, and the buff drops.
import { C, Dizzy, Durability, Item, RunView, Stock, Wielder } from '../../components';
import { buf, helperBuf } from '../../core/buffers';
import { random } from '../../core/rng';
import { after } from '../../core/units';
import type { Seconds } from '../../core/units';
import { entityAt, has, query, toHandle, world } from '../../core/world';
import type { EntityId } from '../../core/world';
import { spawnBuff, spawnWeapon } from '../../prefabs';
import { BuffKind, DIZZY_TICKS, RESPAWN_TICKS, WEAPONS, WEAPON_STOCK, weaponLevelFor } from '../../weapons/defs';
import { randomClearSpot } from '../spots';
import { BOSSES, DROP_EVERY_TICKS, GROUNDED, HELD_ITEMS, MAX_ON_GROUND, breakItem, defOf, fighting, wear } from './items';
import { spinning } from './throwing';

// A hammer that breaks mid-spin leaves whoever spun it dizzy (decided with the user).
export function dizzyIfSpinning(hammer: EntityId): void {
  const h = toHandle(hammer);
  const n = query(helperBuf, C.Wielder);
  for (let i = 0; i < n; i++) {
    const w = entityAt(helperBuf, i);
    if (Wielder.held[w] !== h || !spinning(w)) continue;
    // Which way your feet wander is inputSystem's alone: it turns Dizzy.angle every tick.
    Dizzy.until[w] = after(DIZZY_TICKS);
  }
}

// reads Held items, Durability, RunView, Wielder (a spin) | writes Durability, Dizzy; breaks worn-out items wherever they are
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
    if (defOf(it).durability <= 0 || Durability.value[it] > 0) continue;
    if (defOf(it).heldThrow === 'spin' && has(it, C.Held)) dizzyIfSpinning(it);
    breakItem(it);
  }
}

export const spot = { x: 0, z: 0 };

export const stockCounts = new Int32Array(WEAPONS.length);

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
