import { Arena, C, RunView, Transform } from '../components';
import { TUNNEL } from '../arenas';
import { buf } from '../core/buffers';
import { send } from '../core/outbox';
import { add, entityAt, mask, NO_HANDLE, query, toHandle } from '../core/world';

const PLAYERS = mask(C.PlayerControlled, C.Transform);
const GONE_OR_WAITING = mask(C.Dead, C.TunnelPending);

// reads RunView.tunnelOpen, player Transform | writes TunnelPending; sends TunnelEntered
// The simulation only reports that the player walked in. Whether that moves the
// run on, and what comes along, is the run's decision.
export function tunnelSystem(): void {
  if (!RunView.tunnelOpen) return;
  const n = query(buf, PLAYERS, GONE_OR_WAITING);
  for (let i = 0; i < n; i++) {
    const p = entityAt(buf, i);
    if (Transform.z[p] > -(Arena.half + TUNNEL.enterZ)) continue;
    add(p, C.TunnelPending);
    send('TunnelEntered', toHandle(p), NO_HANDLE, 0);
  }
}
