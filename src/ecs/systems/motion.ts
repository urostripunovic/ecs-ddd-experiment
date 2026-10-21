// The header line of each system is its design doc: reads -> writes.
import { C, Dodge, Knockback, PlayerInput, Transform, Velocity } from '../components';
import { buf } from '../core/buffers';
import { after, inTicks, plus, seconds, ticks, type Seconds } from '../core/units';
import { entityAt, mask, query, world, type EntityId } from '../core/world';
import { controlsLocked } from './cutscene';
import { dodging, speedMul } from './status';

export const PLAYER_SPEED = 6;
// About 3 m in a fifth of a second, invulnerable all the way.
export const DODGE_TICKS = ticks(12);
export const DODGE_SPEED = 15;
// From the end of one dash to the start of the next.
export const DODGE_COOLDOWN = inTicks(seconds(0.75));

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

// Along the move direction, or where you aim when standing still, so a
// dodge always goes somewhere you chose.
function startDodge(entity: EntityId): void {
  const moving = PlayerInput.moveX !== 0 || PlayerInput.moveZ !== 0;
  Dodge.x[entity] = moving ? PlayerInput.moveX : PlayerInput.aimX;
  Dodge.z[entity] = moving ? PlayerInput.moveZ : PlayerInput.aimZ;
  Dodge.until[entity] = after(DODGE_TICKS);
  Dodge.readyAt[entity] = after(plus(DODGE_TICKS, DODGE_COOLDOWN));
}

// reads PlayerInput, RunView, Cutscene, Buffs, Slowed, Knockback, Dodge | writes Velocity (player-controlled only), Dodge
// The only writer of a player's velocity: every other effect arrives as its own field.
export function inputSystem(): void {
  const locked = controlsLocked();
  const speedBase = locked ? 0 : PLAYER_SPEED;
  const n = query(buf, PLAYER_MOVERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    // Every press is acted on once: it dodges, or it's dropped (cooling down,
    // cutscene). Never saved for later, or a dodge would fire out of nowhere.
    if (Dodge.seen[e] !== PlayerInput.dodgePresses) {
      Dodge.seen[e] = PlayerInput.dodgePresses;
      if (!locked && world.tick >= Dodge.readyAt[e]) startDodge(e);
    }
    // A dash ignores slows and shoves: it's how you get out of them.
    if (dodging(e)) {
      Velocity.x[e] = Dodge.x[e] * DODGE_SPEED;
      Velocity.z[e] = Dodge.z[e] * DODGE_SPEED;
      continue;
    }
    const speed = speedBase * speedMul(e);
    const shoved = world.tick < Knockback.until[e];
    Velocity.x[e] = PlayerInput.moveX * speed + (shoved ? Knockback.x[e] : 0);
    Velocity.z[e] = PlayerInput.moveZ * speed + (shoved ? Knockback.z[e] : 0);
  }
}

// reads Velocity | writes Transform
export function movementSystem(dt: Seconds): void {
  const n = query(buf, MOVERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    Transform.x[e] += Velocity.x[e] * dt;
    Transform.y[e] += Velocity.y[e] * dt;
    Transform.z[e] += Velocity.z[e] * dt;
  }
}
