import type { BossEvent } from '../../domain/boss/boss';
import type { Loadout, RunCommand } from '../../domain/run/run';
import { assertNever, type Tick } from '../../domain/shared/types';
import { Ammo, Durability, Health, Item, Wielder } from '../../ecs/components';
import type { OutboxSlot } from '../../ecs/core/outbox';
import { handleAt, indexOf, isLive, type EntityId } from '../../ecs/core/world';
import { idMap } from '../id-map';
import { KIND_NAME } from './loadout';

// What the player has on them, in the run's terms. Read on the tick the sensor
// fired, before anything else can change it.
function snapshotLoadout(p: EntityId): Loadout {
  const h = handleAt(Wielder.held, p);
  const kind = isLive(h) ? KIND_NAME[Item.kind[indexOf(h)]] : null;
  if (!kind) return { hp: Health.hp[p], weapon: null };
  const w = indexOf(h);
  return {
    hp: Health.hp[p],
    weapon: { id: idMap.weaponIdOf(h), kind, durability: Durability.value[w], ammo: Ammo.count[w] },
  };
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
