import type { BossEvent } from '../../domain/boss/boss';
import { carriedWeapon, loadoutOf, type Loadout, type PerkName, type RunCommand } from '../../domain/run/run';
import { assertNever, type Tick } from '../../domain/shared/types';
import { Ammo, C, Durability, Health, Item, Wielder } from '../../ecs/components';
import type { OutboxSlot } from '../../ecs/core/outbox';
import { handleAt, has, indexOf, isLive, type EntityId } from '../../ecs/core/world';
import { PLAYER_ID } from '../ids';
import { idMap } from '../id-map';
import { perkSlots } from '../../ecs/systems/perks';
import { armorPlates } from '../../ecs/systems/armor';
import { doorNameOf, kindNameOf, perkNameOf } from './loadout';

// What the player has on them, in the run's terms. Read on the tick the sensor
// fired, before anything else can change it. This is where simulation numbers
// enter the rules, so they go through the run's own constructors.
function snapshotLoadout(p: EntityId): Loadout {
  const perks = perkSlots(p).map(perkNameOf).filter((name): name is PerkName => name !== null);
  const h = handleAt(Wielder.held, p);
  const kind = isLive(h) ? kindNameOf(Item.kind[indexOf(h)]) : null;
  const armor = armorPlates(p);
  if (!kind) return loadoutOf(Health.hp[p], null, perks, armor);
  const w = indexOf(h);
  return loadoutOf(Health.hp[p], carriedWeapon(idMap.weaponIdOf(h), kind, Durability.value[w], Ammo.count[w], Item.level[w]), perks, armor);
}

function standingLoadout(): Loadout | null {
  const h = idMap.handleOfPlayer(PLAYER_ID);
  if (h === undefined || !isLive(h)) return null;
  const p = indexOf(h);
  return has(p, C.Dead) || Health.hp[p] <= 0 ? null : snapshotLoadout(p);
}

// The run hears about the player directly from the simulation.
export function toRunCommand(slot: OutboxSlot): RunCommand | null {
  const ref = idMap.refOf(slot.subject);
  if (ref?.context !== 'player') return null;
  const tick = slot.tick as Tick;
  switch (slot.kind) {
    case 'EntityDowned': return { kind: 'PlayerDowned', player: ref.id, tick };
    case 'TunnelEntered': {
      return { kind: 'TunnelEntered', player: ref.id, door: doorNameOf(slot.value), loadout: snapshotLoadout(indexOf(slot.subject)), tick };
    }
    case 'RewardTouched': return { kind: 'RewardChosen', player: ref.id, option: slot.value, tick };
    default: return assertNever(slot.kind);
  }
}

// Follow-up: a boss's defeat clears the arena. Cross-area, so it is a new
// request to the run rather than the boss reaching into it.
export function runCommandFromBoss(e: BossEvent): RunCommand | null {
  switch (e.kind) {
    // What you have on you at the kill decides the doors, so it's read now; down
    // on this tick (a trade), there's nothing to carry and the run says what then.
    case 'BossDefeated': return { kind: 'BossCleared', boss: e.boss, loadout: standingLoadout(), tick: e.tick };
    default: return assertNever(e.kind);
  }
}
