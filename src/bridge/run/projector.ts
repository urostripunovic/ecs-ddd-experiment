import type { Doors, Loadout, RunEvent } from '../../domain/run/run';
import { assertNever } from '../../domain/shared/types';
import { C, RunStatus } from '../../ecs/components';
import { RunViewWritable } from '../../ecs/components/run-view';
import { indexOf, isLive, remove, type EntityId } from '../../ecs/core/world';
import { applyReward, clearRewards, revivePlayer } from '../../ecs/systems/rewards';
import { idMap } from '../id-map';
import { PLAYER_ID } from '../ids';
import { REWARD_KIND } from './loadout';
import { openDoors } from './doors';
import { spawnPedestals } from './rewards';

// The player as the world has them now, or -1 if they're gone this tick.
function livePlayer(): EntityId | -1 {
  const h = idMap.handleOfPlayer(PLAYER_ID);
  return h !== undefined && isLive(h) ? indexOf(h) : -1;
}

// Entering an arena rebuilds the whole world, which can't happen halfway through
// draining the outbox. The projector records it; dispatch builds it once the step ends.
let pendingArena: { arena: number; loadout: Loadout } | null = null;

export function takePendingArena(): { arena: number; loadout: Loadout } | null {
  const next = pendingArena;
  pendingArena = null;
  return next;
}

const DOORS_OPENED: Record<Doors, string> = { onward: 'tunnel open', both: 'tunnel and final door open', final: 'final door open' };

// Writes domain truth into components; never sends commands.
export function projectRun(e: RunEvent): string {
  switch (e.kind) {
    case 'RunLost':
      RunViewWritable.status = RunStatus.Lost;
      RunViewWritable.endedAt = e.tick;
      return 'RunView=Lost';
    case 'ArenaCleared': {
      const doors = openDoors(e.doors);
      RunViewWritable.status = RunStatus.Cleared;
      RunViewWritable.tunnelOpen = doors.onward;
      RunViewWritable.finalDoorOpen = doors.final;
      return `RunView=Cleared, ${DOORS_OPENED[e.doors]}`;
    }
    case 'RunWon':
      RunViewWritable.status = RunStatus.Won;
      RunViewWritable.endedAt = e.tick;
      return 'RunView=Won';
    case 'ArenaEntered':
      pendingArena = { arena: e.arena, loadout: e.loadout };
      return `arena ${e.arena} queued (hp ${Math.ceil(e.loadout.hp)}, ${e.loadout.weapon?.kind ?? 'fists'})`;
    case 'TunnelRefused': {
      // The answer that releases the sensor's latch, so stepping in again is reported again.
      const h = idMap.handleOfPlayer(PLAYER_ID);
      if (h !== undefined && isLive(h)) remove(indexOf(h), C.TunnelPending);
      return `latch released (${e.reason})`;
    }
    case 'PlayerRevived': {
      const p = livePlayer();
      if (p !== -1) revivePlayer(p);
      RunViewWritable.revives = e.revivesLeft;
      return `back up (${e.revivesLeft} revives left)`;
    }
    case 'RewardsOffered':
      spawnPedestals(e.options);
      return `pedestals for ${e.options.join(' and ')}`;
    case 'RewardTaken': {
      const p = livePlayer();
      if (p !== -1) {
        clearRewards(p);
        applyReward(p, REWARD_KIND[e.reward]);
      }
      RunViewWritable.revives = e.revives;
      return `took ${e.reward}`;
    }
    case 'RewardRefused': {
      // The answer that releases the sensor's latch, so stepping on a pedestal again is reported again.
      const p = livePlayer();
      if (p !== -1) remove(p, C.RewardPending);
      return `latch released (${e.reason})`;
    }
    default:
      return assertNever(e);
  }
}
