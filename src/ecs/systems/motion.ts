// The header line of each system is its design doc: reads -> writes.
import { C, MatchStatus, MatchView, PlayerInput, Transform, Velocity } from '../components';
import { buf } from '../core/buffers';
import { entityAt, mask, query } from '../core/world';

export const PLAYER_SPEED = 6;

const PLAYER_MOVERS = mask(C.Velocity, C.PlayerControlled);
const MOVERS = mask(C.Transform, C.Velocity);

// reads Transform | writes Transform.px/py/pz
export function snapshotSystem(): void {
  const n = query(buf, C.Transform);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    Transform.px[e] = Transform.x[e];
    Transform.py[e] = Transform.y[e];
    Transform.pz[e] = Transform.z[e];
  }
}

// reads PlayerInput, MatchView | writes Velocity (player-controlled only)
export function inputSystem(): void {
  const active = MatchView.status === MatchStatus.Fighting;
  const n = query(buf, PLAYER_MOVERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    Velocity.x[e] = active ? PlayerInput.moveX * PLAYER_SPEED : 0;
    Velocity.z[e] = active ? PlayerInput.moveZ * PLAYER_SPEED : 0;
  }
}

// reads Velocity | writes Transform
export function movementSystem(dt: number): void {
  const n = query(buf, MOVERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    Transform.x[e] += Velocity.x[e] * dt;
    Transform.y[e] += Velocity.y[e] * dt;
    Transform.z[e] += Velocity.z[e] * dt;
  }
}
