import { Arena, C, RunView, Transform } from '../components';
import { DOORS } from '../arenas';
import { buf } from '../core/buffers';
import { send } from '../core/outbox';
import { add, entityAt, mask, NOBODY, query, toHandle } from '../core/world';

const PLAYERS = mask(C.PlayerControlled, C.Transform);
const GONE_OR_WAITING = mask(C.Dead, C.TunnelPending);

// Which door, as the outbox slot's value.
export const DoorNumber = { Onward: 0, Final: 1 } as const;

// reads RunView.tunnelOpen, RunView.finalDoorOpen, player Transform | writes TunnelPending; sends TunnelEntered
// The simulation only reports that the player walked in, and through which
// door. Whether that moves the run on, and what comes along, is the run's decision.
export function tunnelSystem(): void {
  if (!RunView.tunnelOpen && !RunView.finalDoorOpen) return;
  const n = query(buf, PLAYERS, GONE_OR_WAITING);
  for (let i = 0; i < n; i++) {
    const p = entityAt(buf, i);
    if (Transform.z[p] > -(Arena.half + DOORS.enterZ)) continue;
    add(p, C.TunnelPending);
    // Past the wall line you can only be in a corridor; the nearer door is yours.
    const final = Math.abs(Transform.x[p] - DOORS.final.x) < Math.abs(Transform.x[p] - DOORS.onward.x);
    send('TunnelEntered', toHandle(p), NOBODY, final ? DoorNumber.Final : DoorNumber.Onward);
  }
}
