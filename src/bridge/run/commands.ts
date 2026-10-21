import type { BossEvent } from '../../domain/boss/boss';
import { carriedWeapon, loadoutOf, type Loadout, type PerkName, type RunCommand } from '../../domain/run/run';
import { assertNever, type Tick } from '../../domain/shared/types';
import { Ammo, Durability, Health, Item, Wielder } from '../../ecs/components';
import type { OutboxSlot } from '../../ecs/core/outbox';
import { handleAt, indexOf, isLive, type EntityId } from '../../ecs/core/world';
import { idMap } from '../id-map';
import { perkSlots } from '../../ecs/systems/perks';
import { KIND_NAME, PERK_NAME } from './loadout';

// What the player has on them, in the run's terms. Read on the tick the sensor
// fired, before anything else can change it. This is where simulation numbers
// enter the rules, so they go through the run's own constructors.
function snapshotLoadout(p: EntityId): Loadout {
  const perks = perkSlots(p).map((k) => PERK_NAME[k]).filter((name): name is PerkName => name !== null);
  const h = handleAt(Wielder.held, p);
  const kind = isLive(h) ? KIND_NAME[Item.kind[indexOf(h)]] : null;
  if (!kind) return loadoutOf(Health.hp[p], null, perks);
  const w = indexOf(h);
  return loadoutOf(Health.hp[p], carriedWeapon(idMap.weaponIdOf(h), kind, Durability.value[w], Ammo.count[w]), perks);
}

// The run hears about the player directly from the simulation.
export function toRunCommand(slot: OutboxSlot): RunCommand | null {
  const ref = idMap.refOf(slot.subject);
  if (ref?.context !== 'player') return null;
  const tick = slot.tick as Tick;
  switch (slot.kind) {
    case 'EntityDowned': return { kind: 'PlayerDowned', player: ref.id, tick };
    case 'TunnelEntered':
      return { kind: 'TunnelEntered', player: ref.id, loadout: snapshotLoadout(indexOf(slot.subject)), tick };
    default: return assertNever(slot.kind);
  }
}

// Follow-up: a boss's defeat clears the arena. Cross-area, so it is a new
// request to the run rather than the boss reaching into it.
export function runCommandFromBoss(e: BossEvent): RunCommand | null {
  switch (e.kind) {
    case 'BossDefeated': return { kind: 'BossCleared', boss: e.boss, tick: e.tick };
    default: return assertNever(e.kind);
  }
}
