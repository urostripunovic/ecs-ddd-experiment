import { bit } from '../core/world';

// One bit per component. Tags are bits with no data.
export const C = {
  Transform: bit(0),
  Velocity: bit(1),
  Health: bit(2),
  Weapon: bit(3),
  Team: bit(4),
  Projectile: bit(5),
  PlayerControlled: bit(6),
  Boss: bit(7),
  Collider: bit(8),
  Solid: bit(9),        // tag: other colliders are pushed out of it
  Shape: bit(10),
  Slam: bit(11),        // present only while a slam is winding up
  Dead: bit(12),        // tag
  PhasePending: bit(13), // latch tag: a phase command is waiting for the domain
} as const;
