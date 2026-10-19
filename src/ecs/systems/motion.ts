// The header line of each system is its design doc: reads -> writes.
import { C, Knockback, PlayerInput, Transform, Velocity } from '../components';
import { buf } from '../core/buffers';
import { entityAt, mask, query, world } from '../core/world';
import { controlsLocked } from './cutscene';
import { speedMul } from './status';

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

// reads PlayerInput, MatchView, Cutscene, Buffs, Slowed, Knockback | writes Velocity (player-controlled only)
// The only writer of a player's velocity: every other effect arrives as its own field.
export function inputSystem(): void {
  const speedBase = controlsLocked() ? 0 : PLAYER_SPEED;
  const n = query(buf, PLAYER_MOVERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    const speed = speedBase * speedMul(e);
    const shoved = world.tick < Knockback.until[e];
    Velocity.x[e] = PlayerInput.moveX * speed + (shoved ? Knockback.x[e] : 0);
    Velocity.z[e] = PlayerInput.moveZ * speed + (shoved ? Knockback.z[e] : 0);
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
