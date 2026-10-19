import type { Loadout, RunEvent } from '../../domain/run/run';
import { assertNever } from '../../domain/shared/types';
import { C, RunStatus, RunView } from '../../ecs/components';
import { indexOf, isLive, remove } from '../../ecs/core/world';
import { idMap } from '../id-map';
import { PLAYER_ID } from '../ids';

// Entering an arena rebuilds the whole world, which can't happen halfway through
// draining the outbox. The projector records it; dispatch builds it once the step ends.
let pendingArena: { arena: number; loadout: Loadout } | null = null;

export function takePendingArena(): { arena: number; loadout: Loadout } | null {
  const next = pendingArena;
  pendingArena = null;
  return next;
}

// Writes domain truth into components; never sends commands.
export function projectRun(e: RunEvent): string {
  switch (e.kind) {
    case 'RunLost':
      RunView.status = RunStatus.Lost;
      RunView.endedAt = e.tick;
      return 'RunView=Lost';
    case 'ArenaCleared':
      RunView.status = RunStatus.Cleared;
      RunView.tunnelOpen = true;
      return 'RunView=Cleared, tunnel open';
    case 'RunWon':
      RunView.status = RunStatus.Won;
      RunView.endedAt = e.tick;
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
    default:
      return assertNever(e);
  }
}
